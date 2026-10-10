import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
import './helpers/typescript-source.mjs';
const {submitAccounts,listAccounts,accountsFilter,accountBatch}=await import('../modules/fiscal/accounts.ts');
const fiscal=await import('../modules/fiscal/service.ts');
const {database}=await import('../lib/database.ts');
const db=await connect();
assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1','Only isolated local database');
const originalFetch=globalThis.fetch,actor={role:'cashier',name:'QA Fiscal Accounts'};
let q,other,retained=false,calls=0,sends=0,timeout=true;const seen=new Set();
const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const filter=accountsFilter.parse({from:day,to:day,status:'all'});
async function sale(group,number,product=0,fixture=q){
 const id=randomUUID(),p=fixture.products[product];
 await db.query("INSERT INTO orders(id,restaurant_id,order_number,queue_number,source,fulfillment,status,table_id,checkout_group_id,subtotal_cents,total_cents) VALUES($1,$2,$3,$3,'waiter','dine_in','completed',$4,$5,2000,2000)",[id,fixture.id,number,fixture.table,group]);
 await db.query("INSERT INTO order_items(order_id,product_id,variant_id,product_name,variant_name,kitchen_sector,quantity,unit_price_cents) VALUES($1,$2,$3,'QA','Individual','Cozinha',1,2000)",[id,p.id,p.variant]);
 await db.query("INSERT INTO payments(order_id,method,amount_cents,status,paid_at) VALUES($1,'cash',2000,'paid',now())",[id]);return id;
}
const body=(keys,action='validate',environment='homologation')=>({accounts:keys.map(key=>({key})),action,environment});
const docCount=async()=>Number((await db.query('SELECT count(*) n FROM fiscal_documents WHERE restaurant_id=$1',[q.id])).rows[0].n);
try{
 q=await createCoreFixture(db,'FISCAL-ACCOUNTS');other=await createCoreFixture(db,'FISCAL-ACCOUNTS-OTHER');
 await db.query('INSERT INTO restaurant_domains(hostname,restaurant_id) VALUES($1,$2)',[q.slug+'.localhost',q.id]);
 process.env.FOCUS_NFE_HOMOLOGATION_ENABLED='false';process.env.FOCUS_NFE_PRODUCTION_ENABLED='false';process.env.FOCUS_NFE_CONNECTIONS='{}';
 globalThis.fetch=async()=>{throw new Error('External request forbidden during validation');};
 await fiscal.saveIssuer(q.id,{cnpj:'12345678000123',legalName:'QA SEM VALIDADE FISCAL',ie:'123',regime:'1',accountant:'QA',reviewed:true,presentialApproved:true},actor);
 await fiscal.saveTax(q.id,q.products[0].id,{ncm:'19059090',cfop:'5102',origin:'0',icms:'102',pis:'07',cofins:'07',cest:'',reviewed:true},actor);
 const group=randomUUID(),second=randomUUID(),bad=randomUUID();
 const a=await sale(group,1);await sale(group,2);await sale(second,3);await sale(bad,4,1);const loose=await sale(null,5);const foreign=await sale(null,1,0,other);
 let list=await listAccounts(q.id,filter);assert.equal(list.total,4);assert.equal(list.accounts.find(a=>a.key==='group:'+group).total,4000);assert.equal(list.accounts.find(a=>a.key==='group:'+group).orders.length,2);
 const [one,two]=await Promise.all([submitAccounts(q.id,body(['group:'+group]),actor),submitAccounts(q.id,body(['group:'+group]),actor)]);
 assert.equal(one.results[0].status,'validated');assert.equal(one.results[0].documentId,two.results[0].documentId);assert.equal(await docCount(),1);
 const mixed=await submitAccounts(q.id,body(['group:'+second,'group:'+bad,'order:'+foreign,'order:'+a]),actor);
 assert.deepEqual(mixed.results.map(r=>r.status),['validated','problem','problem','problem']);assert.equal(await docCount(),3);
 for(const environment of ['homologation','production'])assert.equal((await submitAccounts(q.id,body(['order:'+loose],'issue',environment),actor)).results[0].status,'blocked');
 assert.equal((await db.query('SELECT count(*)::int n FROM integration_operations WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 assert.throws(()=>accountBatch.parse(body(Array(21).fill('order:'+loose))));
 await assert.rejects(()=>submitAccounts(q.id,body(['order:'+loose]),{role:'waiter',name:'QA'}));
 assert.equal((await fiscal.fiscalOverview(other.id,'homologation',[one.results[0].documentId])).documents.length,0);
 process.env.FOCUS_NFE_HOMOLOGATION_ENABLED='true';process.env.FOCUS_NFE_HOMOLOGATION_TOKENS=JSON.stringify({[q.id]:'synthetic-local-only'});
 globalThis.fetch=async(input,options={})=>{
  calls++;const u=new URL(input);assert.equal(u.origin,'https://homologacao.focusnfe.com.br');assert.equal(options.redirect,'error');
  const ref=u.searchParams.get('ref') || decodeURIComponent(u.pathname.split('/').at(-1));
  if(options.method==='POST'){sends++;assert.ok(!seen.has(ref),'Duplicate submission');seen.add(ref);if(timeout){timeout=false;throw new Error('Synthetic timeout after provider accepted');}}
  return Response.json({status:'autorizado',ref,cnpj_emitente:'12345678000123',chave_nfe:'3'.repeat(44),numero:'101',serie:'1'});
 };
 const batch=await submitAccounts(q.id,body(['group:'+group,'group:'+second,'group:'+bad],'issue'),actor);
 assert.deepEqual(batch.results.map(r=>r.status),['queued','queued','problem']);assert.equal(calls,0,'Preparation must not call provider');
 const concurrent=await Promise.all([fiscal.processDocument(q.id,batch.results[0].documentId,actor),fiscal.processDocument(q.id,batch.results[0].documentId,actor)]);
 assert.ok(concurrent.some(r=>r.status==='unknown'));assert.equal(sends,1);
 await db.query("UPDATE integration_operations SET lease_until=now()-interval '1 second' WHERE restaurant_id=$1",[q.id]);
 assert.equal((await fiscal.processDocument(q.id,batch.results[0].documentId,actor)).status,'succeeded');assert.equal(sends,1,'Uncertain result queried without a second POST');
 assert.equal((await fiscal.processDocument(q.id,batch.results[1].documentId,actor)).status,'succeeded');assert.equal(sends,2);
 assert.equal((await submitAccounts(q.id,body(['group:'+group],'issue'),actor)).results[0].status,'succeeded');assert.equal(sends,2);
 list=await listAccounts(q.id,filter);assert.equal(list.counts.issued,2);assert.equal(list.counts.problem,1);assert.equal(list.accounts.find(a=>a.key==='group:'+group).status,'issued');
 assert.equal((await listAccounts(q.id,{...filter,search:'101'})).total,2);
 await db.query("UPDATE orders SET status='cancelled' WHERE restaurant_id=$1 AND checkout_group_id=$2",[q.id,group]);
 const reopened=(await listAccounts(q.id,filter)).accounts.find(a=>a.key==='group:'+group);assert.equal(reopened.status,'problem');assert.equal(reopened.documents.length,1,'Fiscal history survives account cancellation');
 assert.equal((await submitAccounts(q.id,body(['group:'+group],'issue'),actor)).results[0].status,'problem');
 await db.query("UPDATE orders SET status='completed' WHERE restaurant_id=$1 AND checkout_group_id=$2",[q.id,group]);
 // A legacy document for only one order must not mark the entire account issued or permit another note.
 const legacy=randomUUID(),legacyA=await sale(legacy,6);await sale(legacy,7);
 await fiscal.prepareDocument(q.id,[legacyA],randomUUID(),actor);
 assert.equal((await listAccounts(q.id,filter)).accounts.find(a=>a.key==='group:'+legacy).status,'problem');
 assert.equal((await submitAccounts(q.id,body(['group:'+legacy],'issue'),actor)).results[0].status,'problem');
 // Paging happens after complete-account grouping, including accounts larger than the 50-row page.
 for(let n=10;n<63;n++)await sale(null,n);
 list=await listAccounts(q.id,filter);assert.equal(list.accounts.length,50);assert.equal(list.total,58);assert.equal((await listAccounts(q.id,{...filter,page:2})).accounts.length,8);
 assert.equal((await listAccounts(q.id,{...filter,from:'2000-01-01',to:'2000-01-01'})).total,0);
 const twenty=list.accounts.filter(a=>a.status==='pending').slice(0,20).map(a=>a.key);
 const concurrentBatches=await Promise.all([submitAccounts(q.id,body(twenty,'issue'),actor),submitAccounts(q.id,body(twenty,'issue'),actor)]);
 assert.equal(concurrentBatches[0].results.length,20);assert.ok(concurrentBatches.flatMap(b=>b.results).every(r=>r.status==='queued'));
 assert.deepEqual(concurrentBatches[0].results.map(r=>r.documentId),concurrentBatches[1].results.map(r=>r.documentId),'Repeated whole batch reuses every durable document');
 assert.equal(sends,2,'Batch queuing itself sends no external request');
 assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM inventory_movements WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 assert.equal((await db.query('SELECT sum(amount_cents)::int n FROM payments WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id=$1)',[q.id])).rows[0].n,60*2000);
 console.log('PASS: complete accounts, same table distinct closures, batch partial failure, persisted reuse, concurrent submission, query after timeout without duplicate, tenant/role denial, both environments disabled, filtered documents, paging/date/search, financial/stock unchanged. Provider transport mocked; zero real notes.');
 if(process.env.RETAIN_FISCAL_ACCOUNTS_QA==='1'){
  await writeFile('work/fiscal-accounts-qa.json',JSON.stringify({...q,keys:{group,second,bad,loose},day},null,2));retained=true;
  console.log('Retained local browser fixture: work/fiscal-accounts-qa.json');
 }
}finally{globalThis.fetch=originalFetch;if(q&&!retained)await cleanupCoreFixture(db,q);if(other)await cleanupCoreFixture(db,other);await db.end();await database.end();}
