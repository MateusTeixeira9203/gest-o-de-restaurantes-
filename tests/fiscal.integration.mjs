import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
const base=process.env.TEST_BASE_URL||'http://localhost:3002';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const db=await connect();let q,other;
async function call(path,body,cookie,method=body?'POST':'GET',key=randomUUID(),host=q.slug+'.test'){
 return new Promise((resolve,reject)=>{const req=http.request(new URL(base+path),{method,headers:{host,'content-type':'application/json','idempotency-key':key,...(cookie?{cookie}:{})}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,body:res.headers['content-type']?.includes('json')?JSON.parse(bytes.toString()):bytes,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});});req.on('error',reject);req.setTimeout(20000,()=>req.destroy(new Error('Timeout')));req.end(body?JSON.stringify(body):undefined);});
}
function ok(r){assert.equal(r.status,200,JSON.stringify(r.body));return r.body;}
try{
 q=await createCoreFixture(db,'FISCAL');other=await createCoreFixture(db,'FISCAL-OTHER');
 await db.query("UPDATE staff_members SET role='cashier' WHERE id=$1",[q.staff.kitchen.id]);
 const manager=await call('/api/auth/login',{username:q.staff.manager.name,password:q.pin});ok(manager);
 const waiter=await call('/api/auth/login',{username:q.staff.waiter.name,password:q.pin});ok(waiter);
 const cashier=await call('/api/auth/login',{username:q.staff.kitchen.name,password:q.pin});ok(cashier);
 assert.equal((await call('/api/internal/fiscal-queue',{})).status,403);
 assert.equal((await call('/api/operations/fiscal')).status,403);assert.equal((await call('/api/operations/fiscal',null,waiter.cookie)).status,403);
 ok(await call('/api/operations/fiscal',null,cashier.cookie));
 const issuer={cnpj:'12345678000123',legalName:'QA restaurante',ie:'123456',regime:'1',accountant:'Contador QA',reviewed:true,presentialApproved:true};
 assert.equal((await call('/api/operations/fiscal',{action:'issuer',data:issuer},cashier.cookie)).status,403);
 ok(await call('/api/operations/fiscal',{action:'issuer',data:issuer},manager.cookie));
 assert.equal(ok(await call('/api/operations/fiscal',null,manager.cookie)).issuer.legalName,issuer.legalName);
 const sale=randomUUID();
 await db.query("INSERT INTO orders(id,restaurant_id,order_number,queue_number,source,fulfillment,status,table_id,subtotal_cents,total_cents) VALUES($1,$2,500,500,'waiter','dine_in','completed',$3,2000,2000)",[sale,q.id,q.table]);
 await db.query("INSERT INTO order_items(order_id,product_id,variant_id,product_name,variant_name,kitchen_sector,quantity,unit_price_cents) VALUES($1,$2,$3,'Prato QA','Individual','Cozinha',1,2000)",[sale,q.products[0].id,q.products[0].variant]);
 await db.query("INSERT INTO payments(order_id,method,amount_cents,status,paid_at) VALUES($1,'cash',2000,'paid',now())",[sale]);
 const prepare={action:'prepare',orderIds:[sale]},key=randomUUID();
 const pair=await Promise.all([call('/api/operations/fiscal',prepare,cashier.cookie,'POST',key),call('/api/operations/fiscal',prepare,cashier.cookie,'POST',key)]);pair.forEach(ok);assert.equal(pair[0].body.id,pair[1].body.id);const id=pair[0].body.id;
 assert.equal((await call('/api/operations/fiscal',prepare,manager.cookie)).status,400);
 let overview=ok(await call('/api/operations/fiscal',null,manager.cookie));assert.ok(overview.documents[0].blockers.some(b=>b.includes('classificação')));assert.equal(overview.sales.length,0);
 const tax={ncm:'19059090',cfop:'5102',origin:'0',icms:'102',pis:'07',cofins:'07',cest:'',reviewed:true};
 ok(await call('/api/operations/fiscal',{action:'product',productId:q.products[0].id,data:tax},manager.cookie));
 assert.equal((await call('/api/operations/fiscal',{action:'product',productId:other.products[0].id,data:tax},manager.cookie)).status,400);
 ok(await call('/api/operations/fiscal',{action:'refresh',documentId:id},cashier.cookie));
 overview=ok(await call('/api/operations/fiscal',null,manager.cookie));assert.deepEqual(overview.documents[0].blockers,[]);assert.equal(overview.documents[0].total_cents,2000);assert.equal(overview.enabled,false,'QA must not enable external network');
 assert.equal((await call('/api/operations/fiscal',{action:'process',documentId:id},cashier.cookie)).status,400);
 assert.equal((await db.query('SELECT count(*)::int n FROM integration_operations WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 const rejectedId=randomUUID();
 await db.query("INSERT INTO integration_operations(id,restaurant_id,environment,kind,provider,operation_key,reference,payload,payload_hash,status,created_by) VALUES($1,$2,'homologation','fiscal','focus','qa-rejected',$3,'{}','qa','failed','QA')",[rejectedId,q.id,'gf_'+randomUUID().replaceAll('-','')]);
 await db.query('UPDATE fiscal_documents SET operation_id=$3 WHERE restaurant_id=$1 AND id=$2',[q.id,id,rejectedId]);
 ok(await call('/api/operations/fiscal',{action:'refresh',documentId:id},cashier.cookie));
 assert.equal((await db.query('SELECT operation_id FROM fiscal_documents WHERE id=$1',[id])).rows[0].operation_id,null);
 assert.equal((await db.query("SELECT count(*)::int n FROM fiscal_events WHERE document_id=$1 AND action='rejected_revision'",[id])).rows[0].n,1);
 assert.equal((await db.query('SELECT status FROM integration_operations WHERE id=$1',[rejectedId])).rows[0].status,'failed');
 const foreign=await call('/api/auth/login',{username:other.staff.manager.name,password:other.pin},null,'POST',randomUUID(),other.slug+'.test');ok(foreign);
 assert.equal((await call('/api/operations/fiscal',null,manager.cookie,'GET',randomUUID(),other.slug+'.test')).status,403);
 assert.equal((await call('/api/operations/fiscal',{action:'refresh',documentId:id},foreign.cookie,'POST',randomUUID(),other.slug+'.test')).status,400);
 const file=(await db.query("INSERT INTO fiscal_files(restaurant_id,document_id,kind,content,mime,sha256) VALUES($1,$2,'xml',$3,'application/xml','qa-fixture') RETURNING id",[q.id,id,Buffer.from('<QA>SEM VALIDADE FISCAL</QA>')])).rows[0];
 assert.equal(ok(await call('/api/operations/fiscal/files/'+file.id,null,cashier.cookie)).toString(),'<QA>SEM VALIDADE FISCAL</QA>');
 assert.equal((await call('/api/operations/fiscal/files/'+file.id,null,foreign.cookie,'GET',randomUUID(),other.slug+'.test')).status,404);
 assert.equal((await call('/api/operations/fiscal/files/'+file.id,null,waiter.cookie)).status,403);
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const archive=ok(await call(`/api/operations/fiscal/export?from=${date}&to=${date}`,null,cashier.cookie));assert.equal(archive.readUInt32LE(0),0x04034b50);assert.ok(archive.includes(Buffer.from('SEM VALIDADE FISCAL')));assert.ok(archive.includes(Buffer.from('INCOMPLETO')));
 assert.equal((await db.query('SELECT count(*)::int n FROM payments WHERE order_id=$1',[sale])).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 await db.query("UPDATE restaurants SET plan='essential' WHERE id=$1",[q.id]);assert.equal((await call('/api/operations/fiscal',null,manager.cookie)).status,400);
 console.log('PASS: fiscal UI API persistence, cashier/manager/waiter roles, source snapshots, concurrent preparation, blocked transmission, cross-tenant API/files, private export, no duplicate financial effects.');
}finally{if(q)await cleanupCoreFixture(db,q);if(other)await cleanupCoreFixture(db,other);await db.end();}
