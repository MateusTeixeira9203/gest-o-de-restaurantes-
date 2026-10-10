import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import './helpers/typescript-source.mjs';
const {preparePaymentIntent}=await import('../modules/payments/settlement.ts');
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
const db=await connect(),base=process.env.TEST_BASE_URL||'http://127.0.0.1:3100',fixtures=[];
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
async function call(q,path,body,cookie){return new Promise((resolve,reject)=>{const req=http.request(new URL(base+path),{method:body?'POST':'GET',headers:{host:q.slug+'.test','content-type':'application/json','idempotency-key':randomUUID(),...(cookie?{cookie}:{})}},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
const ok=r=>{assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
try{
 for(const tag of ['PAY','OTHER'])fixtures.push(await createCoreFixture(db,tag));
 const [a,b]=fixtures;
 for(const q of fixtures){q.cookies={};for(const role of ['manager','waiter']){const r=await call(q,'/api/auth/login',{username:q.staff[role].name,password:q.pin});ok(r);q.cookies[role]=r.cookie;}}
 const shift=ok(await call(a,'/api/operations/finance',{action:'open_shift',openingCents:0},a.cookies.manager));
 let number=1;
 async function intent(environment='production',externalId=randomUUID()){
  number++;await db.query('INSERT INTO dining_tables(restaurant_id,number,label) VALUES($1,$2,$3)',[a.id,number,'QA Integrated']);
  const order=ok(await call(a,'/api/operations/orders',{tableNumber:number,sendToKitchen:true,items:[{productId:a.products[0].id,variantId:a.products[0].variant,quantity:1}]},a.cookies.waiter)).order;
  const amount=Number((await db.query('SELECT total_cents FROM orders WHERE id=$1',[order.id])).rows[0].total_cents);
  const request={amountCents:amount,currency:'BRL',method:'pix',channel:'direct'},key=randomUUID(),actor={role:'manager',name:'Synthetic test'};
  await db.query('BEGIN');let op;
  try{
   op=await preparePaymentIntent(db,a.id,number,request,'qa_provider',environment,key,actor);
   assert.equal((await preparePaymentIntent(db,a.id,number,request,'qa_provider',environment,key,actor)).id,op.id);
   await assert.rejects(()=>preparePaymentIntent(db,a.id,number,request,'qa_provider',environment,randomUUID(),actor),/cobrança pendente/);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  // Only synthetic trusted-adapter evidence; never sent by browser in production.
  await db.query("UPDATE integration_operations SET status='succeeded',result=$2::jsonb WHERE id=$1",[op.id,JSON.stringify({code:'payment_confirmed',externalId})]);
  return {op,order,amount,externalId};
 }
 const p=await intent();
 assert.equal((await call(a,'/api/operations/integrated-payments',{operationId:p.op.id},a.cookies.waiter)).status,403);
 assert.equal((await call(b,'/api/operations/integrated-payments',{operationId:p.op.id},b.cookies.manager)).status,400);
 assert.equal((await call(a,'/api/operations/integrated-payments',{operationId:p.op.id,paid:true},a.cookies.manager)).status,400);
 const results=await Promise.all(Array.from({length:4},()=>call(a,'/api/operations/integrated-payments',{operationId:p.op.id},a.cookies.manager)));
 assert.ok(results.every(r=>ok(r).state==='applied'));assert.equal(results.filter(r=>!r.body.replayed).length,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM payments WHERE order_id=$1 AND status='paid'",[p.order.id])).rows[0].n,1);
 assert.equal(Number((await db.query("SELECT sum(l.debit_cents-l.credit_cents) total FROM finance_lines l JOIN finance_entries e ON e.id=l.entry_id WHERE e.restaurant_id=$1",[a.id])).rows[0].total),0);
 const snapshot=ok(await call(a,'/api/operations/integrated-payments',null,a.cookies.manager));assert.equal(snapshot.items.find(i=>i.operation_id===p.op.id).state,'applied');
 const h=await intent('homologation');assert.equal(ok(await call(a,'/api/operations/integrated-payments',{operationId:h.op.id},a.cookies.manager)).state,'homologation');
 const d=await intent('production',p.externalId);assert.equal(ok(await call(a,'/api/operations/integrated-payments',{operationId:d.op.id},a.cookies.manager)).state,'review');
 const changed=await intent();await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[changed.order.id]);assert.equal(ok(await call(a,'/api/operations/integrated-payments',{operationId:changed.op.id},a.cookies.manager)).state,'review');
 const pending=await intent();await db.query("UPDATE integration_operations SET status='pending' WHERE id=$1",[pending.op.id]);assert.equal(ok(await call(a,'/api/operations/integrated-payments',{operationId:pending.op.id},a.cookies.manager)).state,'awaiting');
 const late=await intent();ok(await call(a,'/api/operations/finance',{action:'close_shift',shiftId:shift.id,countedCents:0,note:'Synthetic close'},a.cookies.manager));assert.equal(ok(await call(a,'/api/operations/integrated-payments',{operationId:late.op.id},a.cookies.manager)).state,'review');
 assert.equal((await db.query("SELECT count(*)::int n FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=$1",[a.id])).rows[0].n,1);
 console.log('PASS: trusted payment bridge, 4 simultaneous retries once, balanced ledger, persisted reload, tenant/role rejection, client-forged evidence denied, homology no money, duplicate external ID, cancelled account, pending provider and closed shift without extra payments.');
}finally{for(const q of fixtures.reverse()){await db.query('DELETE FROM payment_intents WHERE restaurant_id=$1',[q.id]);await cleanupCoreFixture(db,q);}await db.end();}
