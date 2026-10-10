import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
const base=process.env.TEST_BASE_URL||'http://localhost:3001';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const db=await connect();
let q;
async function call(path,body,cookie,method=body?'POST':'GET',key=randomUUID()){
 const start=performance.now();
 return new Promise((resolve,reject)=>{
  const req=http.request(new URL(base+path),{method,headers:{host:q.slug+'.test','content-type':'application/json','idempotency-key':key,...(cookie?{cookie}:{})}},res=>{
   let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw),cookie:res.headers['set-cookie']?.[0]?.split(';')[0],start,end:performance.now()});}catch(e){reject(e);}});
  });req.on('error',reject);req.setTimeout(20000,()=>req.destroy(new Error('Request timed out')));req.end(body?JSON.stringify(body):undefined);
 });
}
function ok(r){assert.ok(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body;}
async function together(actions){const responses=await Promise.all(actions.map(f=>f()));assert.ok(Math.max(...responses.map(r=>r.start))<Math.min(...responses.map(r=>r.end)),'Requests must overlap');return responses;}
try {
 q=await createCoreFixture(db,'WAITERS');
 const second='QA second waiter '+randomUUID().slice(0,8);
 await db.query("INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) SELECT $1,restaurant_id,$2,'waiter',pin_salt,pin_hash FROM staff_members WHERE id=$3",[randomUUID(),second,q.staff.waiter.id]);
 await db.query("INSERT INTO dining_tables(id,restaurant_id,number,label) VALUES($1,$2,2,'Mesa QA 2')",[randomUUID(),q.id]);
 const sessions=await Promise.all([q.staff.waiter.name,second,q.staff.manager.name,q.staff.kitchen.name].map(username=>call('/api/auth/login',{username,password:q.pin})));
 sessions.forEach(ok);const [a,b,manager,kitchen]=sessions.map(r=>r.cookie);assert.notEqual(a,b);
 const shift=ok(await call('/api/operations/finance',{action:'open_shift',openingCents:10000},manager));
 const create=(table,index,cookie)=>call('/api/operations/orders',{tableNumber:table,sendToKitchen:true,items:[{productId:q.products[index].id,variantId:q.products[index].variant,quantity:1,note:'QA simultaneous waiter'}]},cookie);
 async function serve(ids,cookies){
  const tickets=(await db.query('SELECT id FROM kitchen_tickets WHERE order_id=ANY($1::uuid[])',[ids])).rows;
  assert.equal(tickets.length,ids.length);
  (await together(tickets.map(t=>()=>call('/api/internal/kitchen/'+t.id,{status:'ready'},kitchen,'PATCH')))).forEach(ok);
  (await together(ids.map((id,i)=>()=>call('/api/operations/orders/'+id+'/serve',{},cookies[i])))).forEach(ok);
 }
 // Two different tables: concurrent creation, fulfillment and payment.
 const separate=await together([()=>create(1,0,a),()=>create(2,1,b)]);const ids=separate.map(r=>ok(r).order.id);
 assert.notEqual(ids[0],ids[1]);
 const rows=(await db.query('SELECT o.id,o.order_number,t.number AS table_number,o.total_cents FROM orders o JOIN dining_tables t ON t.id=o.table_id WHERE o.id=ANY($1::uuid[])',[ids])).rows;
 assert.equal(new Set(rows.map(r=>r.order_number)).size,2);assert.deepEqual(rows.map(r=>[r.table_number,r.total_cents]).sort(),[[1,2200],[2,3300]]);
 await serve(ids,[a,b]);
 const quotes=await together([()=>call('/api/operations/checkout',{tableNumber:1},a),()=>call('/api/operations/checkout',{tableNumber:2},b)]);quotes.forEach(ok);
 const paid=await together(quotes.map((r,i)=>()=>call('/api/operations/payments',{tableNumber:i+1,allowPartial:true,expectedVersion:r.body.version,payments:[{method:'Pix',amountCents:r.body.dueCents}]},[a,b][i])));paid.forEach(ok);
 for(const cookie of [a,b]){const state=ok(await call('/api/operations/state',null,cookie));for(const id of ids)assert.equal(state.orders.find(o=>o.id===id)?.status,'completed');}
 console.log('PASS 1: two distinct waiter sessions; overlapping requests on different tables; unique orders/tickets, correct totals, both sessions reload completed orders.');
 // Same table: concurrent additions then both attempt to settle the same balance.
 const shared=await together([()=>create(1,0,a),()=>create(1,1,b)]);const sharedIds=shared.map(r=>ok(r).order.id);await serve(sharedIds,[a,b]);
 const sharedQuotes=await together([()=>call('/api/operations/checkout',{tableNumber:1},a),()=>call('/api/operations/checkout',{tableNumber:1},b)]);sharedQuotes.forEach(ok);assert.equal(sharedQuotes[0].body.dueCents,5500);assert.equal(sharedQuotes[0].body.version,sharedQuotes[1].body.version);
 const keys=[randomUUID(),randomUUID()];
 const payload={tableNumber:1,allowPartial:true,expectedVersion:sharedQuotes[0].body.version,payments:[{method:'Pix',amountCents:5500}]};
 const race=await together([()=>call('/api/operations/payments',payload,a,'POST',keys[0]),()=>call('/api/operations/payments',payload,b,'POST',keys[1])]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,400]);
 const winner=race.findIndex(r=>r.status===200),loser=1-winner;
 assert.match(race[loser].body.error,/conta mudou/i);
 assert.deepEqual(ok(await call('/api/operations/payments',payload,[a,b][winner],'POST',keys[winner])),race[winner].body);
 const payments=(await db.query("SELECT count(*)::int AS n,sum(p.amount_cents)::int AS cents FROM payments p WHERE p.order_id=ANY($1::uuid[]) AND p.status='paid'",[sharedIds])).rows[0];assert.equal(payments.cents,5500);assert.equal(payments.n,2,'One allocated payment per order, not duplicated by second waiter');
 for(const cookie of [a,b]){const state=ok(await call('/api/operations/state',null,cookie));for(const id of sharedIds)assert.equal(state.orders.find(o=>o.id===id)?.status,'completed');}
 const final=(await db.query("SELECT count(*)::int AS n FROM finance_entries WHERE restaurant_id=$1 AND source_type='sale_realized'",[q.id])).rows[0];assert.equal(final.n,4);
 assert.equal((await db.query('SELECT sum(debit_cents-credit_cents)::int AS n FROM finance_lines WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 ok(await call('/api/operations/finance',{action:'close_shift',shiftId:shift.id,countedCents:10000,note:'QA two waiters'},manager));
 console.log('PASS 2: concurrent additions to one table; settlement race 200/400; stale waiter instructed to refresh; winning retry idempotent; R$55 paid once, four total sales, balanced journal, R$100 cash close.');
} finally {if(q){await cleanupCoreFixture(db,q);console.log('Synthetic tenant removed.');}await db.end();}
