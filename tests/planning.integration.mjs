import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
const base=process.env.TEST_BASE_URL||'http://localhost:3002';
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
 q=await createCoreFixture(db,'PLAN');
 const login=await call('/api/auth/login',{username:q.staff.manager.name,password:q.pin});ok(login);const manager=login.cookie;
 const w=await call('/api/auth/login',{username:q.staff.waiter.name,password:q.pin});ok(w);
 const today=new Date().toISOString().slice(0,10);
 const baseDoc={kind:'payable',title:'QA contrato',contact:'Fornecedor QA',category:'operating',amountCents:10000,competenceDate:'2027-01-31',dueDate:'2027-01-31'};
 const payload={action:'create_series',mode:'installments',count:3,...baseDoc},key=randomUUID();
 const pair=await together([()=>call('/api/operations/finance',payload,manager,'POST',key),()=>call('/api/operations/finance',payload,manager,'POST',key)]);pair.forEach(ok);assert.deepEqual(pair[0].body,pair[1].body);
 const docs=(await db.query('SELECT id,amount_cents,due_date::text,competence_date::text FROM finance_documents WHERE series_id=$1 ORDER BY occurrence',[pair[0].body.seriesId])).rows;
 assert.deepEqual(docs.map(d=>Number(d.amount_cents)),[3334,3333,3333]);assert.deepEqual(docs.map(d=>d.due_date),['2027-01-31','2027-02-28','2027-03-31']);assert.ok(docs.every(d=>d.competence_date==='2027-01-31'));
 assert.equal((await call('/api/operations/finance',payload,w.cookie)).status,403);
 const recurring=ok(await call('/api/operations/finance',{...payload,mode:'recurring'},manager));
 ok(await call('/api/operations/finance',{action:'settle_document',documentId:recurring.documentIds[0],amountCents:1000,paidOn:today,account:'bank'},manager));
 const stopped=ok(await call('/api/operations/finance',{action:'stop_series',seriesId:recurring.seriesId,reason:'QA fim contrato'},manager));assert.equal(stopped.cancelled,2);
 const preserved=(await db.query('SELECT cancelled_at FROM finance_documents WHERE id=$1',[recurring.documentIds[0]])).rows[0];assert.equal(preserved.cancelled_at,null);
 assert.equal((await db.query("SELECT sum(l.debit_cents-l.credit_cents)::int n FROM finance_lines l JOIN finance_entries e ON e.id=l.entry_id JOIN finance_accounts a ON a.id=l.account_id WHERE e.restaurant_id=$1 AND e.effective_date='2027-02-28' AND a.code='operating'",[q.id])).rows[0].n,0);
 const item=ok(await call('/api/operations/inventory',{name:'Farinha QA',unit:'g',quantity:1000,unitCostCents:1},manager));
 const buy={action:'create_purchase',supplier:'Fornecedor QA',reference:'QA-001',purchasedOn:today,dueDate:today,count:3,lines:[{itemId:item.id,quantity:2,unit:'kg',totalCents:6001}]};
 const purchase=ok(await call('/api/operations/finance',buy,manager));
 assert.equal((await call('/api/operations/finance',buy,manager)).status,400,'Duplicate supplier reference');
 assert.equal((await call('/api/operations/finance',{...buy,reference:'BAD',lines:[{...buy.lines[0],unit:'L'}]},manager)).status,400);
 const line=(await db.query('SELECT id,base_quantity FROM purchase_lines WHERE purchase_id=$1',[purchase.id])).rows[0];assert.equal(Number(line.base_quantity),2000);
 const before=(await db.query('SELECT quantity FROM inventory_items WHERE id=$1',[item.id])).rows[0];assert.equal(Number(before.quantity),1000,'Purchase does not receive automatically');
 const receive={action:'receive_purchase',purchaseId:purchase.id,lines:[{lineId:line.id,quantity:1,unit:'kg'}]},receiveKey=randomUUID();
 const receipts=await together([()=>call('/api/operations/finance',receive,manager,'POST',receiveKey),()=>call('/api/operations/finance',receive,manager,'POST',receiveKey)]);receipts.forEach(ok);
 let stock=(await db.query('SELECT quantity,average_cost_cents FROM inventory_items WHERE id=$1',[item.id])).rows[0];assert.equal(Number(stock.quantity),2000);assert.ok(Math.abs(Number(stock.average_cost_cents)-2.00025)<0.001);
 assert.equal((await call('/api/operations/finance',{...receive,lines:[{lineId:line.id,quantity:1.001,unit:'kg'}]},manager)).status,400);
 assert.equal((await call('/api/operations/finance',{action:'cancel_purchase',purchaseId:purchase.id,reason:'QA cancel'},manager)).status,400);
 const race=await together([()=>call('/api/operations/finance',receive,manager),()=>call('/api/operations/finance',receive,manager)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,400]);
 stock=(await db.query('SELECT quantity FROM inventory_items WHERE id=$1',[item.id])).rows[0];assert.equal(Number(stock.quantity),3000);
 assert.equal((await db.query('SELECT count(*)::int n FROM inventory_movements WHERE purchase_line_id=$1',[line.id])).rows[0].n,2);
 assert.equal((await db.query('SELECT count(*)::int n FROM finance_settlements s JOIN finance_documents d ON d.id=s.document_id WHERE d.series_id=$1',[purchase.seriesId])).rows[0].n,0,'Receiving does not pay supplier');
 const cancelled=ok(await call('/api/operations/finance',{...buy,reference:'QA-CANCEL'},manager));ok(await call('/api/operations/finance',{action:'cancel_purchase',purchaseId:cancelled.id,reason:'QA compra desfeita'},manager));
 const snap=ok(await call('/api/operations/finance?from='+today+'&to='+today,null,manager));assert.equal(snap.purchases.length,2);assert.equal(snap.series.length,4);
 const foreign=await createCoreFixture(db,'FOREIGN');try{const otherItem=await db.query("INSERT INTO inventory_items(restaurant_id,name,unit,quantity,minimum_quantity,average_cost_cents) VALUES($1,'Other','g',0,0,0) RETURNING id",[foreign.id]);assert.equal((await call('/api/operations/finance',{...buy,reference:'CROSS',lines:[{...buy.lines[0],itemId:otherItem.rows[0].id}]},manager)).status,400);}finally{await cleanupCoreFixture(db,foreign);}
 assert.equal((await db.query('SELECT sum(debit_cents-credit_cents)::int n FROM finance_lines WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 console.log('PASS: exact installments/month ends; recurring stop preserves paid titles; future reversal dates; roles; linked purchase, units, partial receipts, idempotency/concurrent excess denial, weighted cost, no automatic settlement, duplicate reference and cross-tenant rejection, cancellation before receipt, snapshot and balanced journal.');
}finally {if(q)await cleanupCoreFixture(db,q);await db.end();console.log('Synthetic planning fixtures removed.');}
