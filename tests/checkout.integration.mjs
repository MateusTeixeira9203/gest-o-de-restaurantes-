import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
const db=await connect(),base=process.env.TEST_BASE_URL||'http://localhost:3000';
const fixtures=[];
async function call(q,path,body,cookie,method=body?'POST':'GET',key=randomUUID()){
 return new Promise((resolve,reject)=>{const req=http.request(new URL(base+path),{method,headers:{host:q.slug+'.test','content-type':'application/json','idempotency-key':key,...(cookie?{cookie}:{})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(text),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});}catch(e){reject(e);}});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
}
const success=r=>{assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
try{
 assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 for(const tag of ['A','B','C'])fixtures.push(await createCoreFixture(db,tag));
 const [a,b,c]=fixtures;
 for(const q of fixtures){q.cookies={};for(const role of ['manager','waiter','kitchen']){const r=await call(q,'/api/auth/login',{username:q.staff[role].name,password:q.pin});success(r);q.cookies[role]=r.cookie;}}
 const config={enabled:true,key:'123e4567-e12b-12d1-a456-426655440000',name:'QA RESTAURANTE',city:'BELO HORIZONTE'};
 success(await call(a,'/api/operations/payment-settings',config,a.cookies.manager,'PUT'));
 assert.equal((await call(a,'/api/operations/payment-settings',config,a.cookies.waiter,'PUT')).status,403);
 for(const q of [b,c]){assert.equal((await call(q,'/api/operations/payment-settings',null,a.cookies.manager)).status,403);assert.equal(success(await call(q,'/api/operations/payment-settings',null,q.cookies.manager)).enabled,false);}
 const shift=success(await call(a,'/api/operations/finance',{action:'open_shift',openingCents:10000},a.cookies.manager));
 const made=success(await call(a,'/api/operations/orders',{tableNumber:1,sendToKitchen:true,items:a.products.map(p=>({productId:p.id,variantId:p.variant,quantity:1}))},a.cookies.waiter));const id=made.order.id;
 const tickets=(await db.query('SELECT id,kitchen_sector,status FROM kitchen_tickets WHERE order_id=$1',[id])).rows;assert.equal(tickets.length,2);assert.ok(tickets.every(t=>t.status==='new'));
 assert.equal((await call(a,'/api/operations/orders/'+id+'/serve',{},a.cookies.waiter)).status,400);
 const quote=success(await call(a,'/api/operations/checkout',{tableNumber:1,amountCents:1000},a.cookies.waiter));assert.equal(quote.dueCents,5500);assert.equal(quote.amountCents,1000);assert.ok(quote.pix.code.includes('540510.00'));assert.ok(quote.pix.image.startsWith('data:image/png;base64,'));assert.equal((await db.query('SELECT count(*)::int n FROM payments WHERE order_id=$1',[id])).rows[0].n,0);
 assert.equal((await call(a,'/api/operations/checkout',{tableNumber:1},a.cookies.kitchen)).status,403);
 assert.equal((await call(b,'/api/operations/checkout',{tableNumber:1},a.cookies.waiter)).status,403);
 assert.equal((await call(a,'/api/operations/checkout',{tableNumber:1,amountCents:5501},a.cookies.waiter)).status,400);
 const body={tableNumber:1,allowPartial:true,expectedVersion:quote.version,payments:[{method:'Pix',amountCents:1000}]},key=randomUUID();
 const [r1,r2]=await Promise.all([call(a,'/api/operations/payments',body,a.cookies.waiter,'POST',key),call(a,'/api/operations/payments',body,a.cookies.waiter,'POST',key)]);assert.deepEqual(success(r1),success(r2));assert.equal(r1.body.remainingCents,4500);
 assert.equal((await call(a,'/api/operations/payments',body,a.cookies.waiter)).status,400);
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,'confirmed');
 success(await call(a,'/api/internal/kitchen/'+tickets[0].id,{status:'preparing'},a.cookies.kitchen,'PATCH'));
 assert.equal((await db.query('SELECT status FROM kitchen_tickets WHERE id=$1',[tickets[1].id])).rows[0].status,'new');
 success(await call(a,'/api/internal/kitchen/'+tickets[0].id,{status:'ready'},a.cookies.kitchen,'PATCH'));
 assert.equal((await call(a,'/api/operations/orders/'+id+'/serve',{},a.cookies.waiter)).status,400);
 success(await call(a,'/api/internal/kitchen/'+tickets[1].id,{status:'ready'},a.cookies.kitchen,'PATCH'));
 success(await call(a,'/api/operations/orders/'+id+'/serve',{},a.cookies.waiter));
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,'delivered');
 const q2=success(await call(a,'/api/operations/checkout',{tableNumber:1},a.cookies.waiter));assert.equal(q2.dueCents,4500);
 const p2=success(await call(a,'/api/operations/payments',{tableNumber:1,allowPartial:true,expectedVersion:q2.version,payments:[{method:'Dinheiro',amountCents:500}]},a.cookies.waiter));assert.equal(p2.remainingCents,4000);assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,'delivered','Partial payment must not complete served order');
 const q3=success(await call(a,'/api/operations/checkout',{tableNumber:1},a.cookies.waiter));
 const final=success(await call(a,'/api/operations/payments',{tableNumber:1,allowPartial:true,expectedVersion:q3.version,payments:[{method:'Crédito',amountCents:3000},{method:'Dinheiro',amountCents:1500}]},a.cookies.waiter));assert.equal(final.changeCents,500);assert.equal(final.remainingCents,0);
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,'completed');assert.equal(Number((await db.query("SELECT sum(amount_cents) total FROM payments WHERE order_id=$1 AND status='paid'",[id])).rows[0].total),5500);
 assert.equal((await db.query("SELECT count(*)::int n FROM finance_entries WHERE restaurant_id=$1 AND source_type='sale_realized'",[a.id])).rows[0].n,1);
 success(await call(a,'/api/operations/finance',{action:'close_shift',shiftId:shift.id,countedCents:11500,note:'QA isolated shift'},a.cookies.manager));
 console.log('PASS: three independent restaurants, roles, Pix QR without payment, partial/mixed receipts, idempotent concurrency, stale quote rejection, kitchen sectors, ready/serve/settle and cash close.');
}finally{for(const q of fixtures.reverse())await cleanupCoreFixture(db,q);await db.end();console.log('Synthetic restaurant fixtures removed.');}
