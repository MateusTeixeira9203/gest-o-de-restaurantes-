import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3100';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const db=await connect();assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1');let q,other;
async function call(path,body,cookie,fixture=q){return new Promise((resolve,reject)=>{const req=http.request(new URL(base+path),{method:body?'POST':'GET',headers:{host:fixture.slug+'.test','content-type':'application/json',...(cookie?{cookie}:{})}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks)),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]}));});req.on('error',reject);req.setTimeout(20000,()=>req.destroy(new Error('timeout')));req.end(body?JSON.stringify(body):undefined);});}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
try{
 q=await createCoreFixture(db,'ACCOUNTS-API');other=await createCoreFixture(db,'ACCOUNTS-API-OTHER');await db.query("UPDATE staff_members SET role='cashier' WHERE id=$1",[q.staff.kitchen.id]);
 const waiter=await call('/api/auth/login',{username:q.staff.waiter.name,password:q.pin});ok(waiter);
 const cashier=await call('/api/auth/login',{username:q.staff.kitchen.name,password:q.pin});ok(cashier);
 const foreign=await call('/api/auth/login',{username:other.staff.manager.name,password:other.pin},null,other);ok(foreign);
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),path=`/api/operations/fiscal/accounts?from=${day}&to=${day}&status=all`;
 assert.equal((await call(path)).status,403);assert.equal((await call(path,null,waiter.cookie)).status,403);assert.equal(ok(await call(path,null,cashier.cookie)).enabled,false);
 const group=randomUUID();for(let number=1;number<=2;number++)await db.query("INSERT INTO orders(restaurant_id,order_number,queue_number,source,fulfillment,status,table_id,checkout_group_id,subtotal_cents,total_cents) VALUES($1,$2,$2,'waiter','dine_in','completed',$3,$4,2000,2000)",[q.id,number,q.table,group]);
 const body={environment:'homologation',action:'validate',accounts:[{key:'group:'+group}]};
 assert.equal((await call('/api/operations/fiscal/accounts',body,waiter.cookie)).status,403);
 assert.equal(ok(await call(path,null,cashier.cookie)).accounts[0].total,4000);
 const pair=await Promise.all([call('/api/operations/fiscal/accounts',body,cashier.cookie),call('/api/operations/fiscal/accounts',body,cashier.cookie)]);pair.forEach(ok);const id=pair[0].body.results[0].documentId;assert.ok(id);assert.equal(id,pair[1].body.results[0].documentId);
 assert.equal(ok(await call('/api/operations/fiscal?documents='+id,null,cashier.cookie)).documents.length,1);
 assert.equal(ok(await call('/api/operations/fiscal?documents='+id,null,foreign.cookie,other)).documents.length,0);
 assert.equal((await call(path,null,cashier.cookie,other)).status,403);
 assert.equal(ok(await call('/api/operations/fiscal/accounts',body,foreign.cookie,other)).results[0].status,'problem');
 assert.equal((await db.query('SELECT count(*)::int n FROM fiscal_documents WHERE restaurant_id=$1',[other.id])).rows[0].n,0);
 assert.equal((await call(path.replace(day,'2026-99-99'),null,cashier.cookie)).status,400);
 assert.equal((await call('/api/operations/fiscal/accounts',{...body,accounts:[...body.accounts,...body.accounts]},cashier.cookie)).status,400);
 assert.equal((await db.query('SELECT count(*)::int n FROM integration_operations WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 await db.query("UPDATE restaurants SET plan='essential' WHERE id=$1",[q.id]);assert.equal((await call(path,null,cashier.cookie)).status,400);
 console.log('PASS: account API authenticated roles, tenant/host isolation, complete account totals, concurrent reuse, private detail IDs, invalid dates/duplicate selection, professional gate and zero external operations.');
}finally{if(q)await cleanupCoreFixture(db,q);if(other)await cleanupCoreFixture(db,other);await db.end();}
