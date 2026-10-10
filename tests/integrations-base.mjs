import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {connect} from '../scripts/database.mjs';
import {prepare,dispatch,readOperation} from '../modules/integrations/queue.ts';
import {authorize,validatePayment,paymentEvidence} from '../modules/integrations/contracts.ts';
import {paymentHomologation} from '../modules/payments/provider.ts';
import {focusHomologation} from '../modules/fiscal/focus.ts';

const manager={role:'manager',name:'QA'},cashier={role:'cashier',name:'QA'},waiter={role:'waiter',name:'QA'};
authorize('fiscal',cashier);authorize('payment',waiter);assert.throws(()=>authorize('fiscal',waiter));assert.throws(()=>authorize('payment',{role:'kitchen',name:'QA'}));
const pix={amountCents:1000,currency:'BRL',method:'pix',channel:'terminal',terminalId:'QA'};
validatePayment(pix,[{method:'pix',channel:'terminal'}]);assert.throws(()=>validatePayment(pix,[{method:'pix',channel:'direct'}]));assert.throws(()=>validatePayment({...pix,terminalId:''},[{method:'pix',channel:'terminal'}]));
assert.equal(paymentEvidence({...pix,reference:'a'},{reference:'a',amountCents:1000,currency:'BRL',status:'paid',externalId:'test'}).status,'succeeded');
for(const mismatch of [{reference:'b'},{amountCents:999},{currency:'USD'}])assert.equal(paymentEvidence({...pix,reference:'a'},{reference:'a',amountCents:1000,currency:'BRL',status:'paid',externalId:'test',...mismatch}).status,'unknown');
assert.equal(paymentEvidence({...pix,reference:'a'},{reference:'a',amountCents:1000,currency:'BRL',status:'paid'}).status,'pending');

const db=await connect(),other=await connect();const schema='qa_integrations_'+randomUUID().replaceAll('-','');
let created=false;
try {
 await db.query(`CREATE SCHEMA ${schema}`);created=true;
 for(const c of [db,other])await c.query(`SET search_path TO ${schema}`);
 await db.query('CREATE TABLE restaurants(id uuid PRIMARY KEY)');
 const migration=await readFile('drizzle/0015_integration_operations.sql','utf8');
 await db.query('BEGIN');await db.query(migration);await db.query('ROLLBACK');
 assert.equal((await db.query("SELECT to_regclass('integration_operations') AS t")).rows[0].t,null);
 await db.query(migration);
 const rid=randomUUID(),rid2=randomUUID();await db.query('INSERT INTO restaurants VALUES($1),($2)',[rid,rid2]);
 const input={restaurantId:rid,environment:'homologation',kind:'fiscal',provider:'focus',key:'sale-qa',payload:{cnpj_emitente:'12345678000123',items:[{numero_item:1}],formas_pagamento:[{forma_pagamento:'01'}]}};
 const [a,b]=await Promise.all([prepare(db,input,manager),prepare(other,input,cashier)]);assert.equal(a.id,b.id);assert.equal(a.reference,b.reference);
 assert.equal((await prepare(db,{...input,payload:{formas_pagamento:input.payload.formas_pagamento,items:input.payload.items,cnpj_emitente:input.payload.cnpj_emitente}},manager)).id,a.id);
 await assert.rejects(()=>prepare(db,{...input,payload:{...input.payload,extra:1}},manager));
 await assert.rejects(()=>prepare(db,{...input,key:'secret',payload:{nested:{token:'never-store'}}},manager));
 await assert.rejects(()=>prepare(db,{...input,key:'denied'},waiter));
 assert.equal(await readOperation(db,rid2,a.id),null);
 const second=await prepare(db,{...input,restaurantId:rid2},manager);assert.notEqual(second.reference,a.reference);
 let submissions=0,consultations=0,release;
 const barrier=new Promise(resolve=>{release=resolve});
 const provider={id:'focus',kind:'fiscal',environment:'homologation',restaurantId:rid,enabled:true,
   submit:async()=>{submissions++;await barrier;throw new Error('token must not leak');},
   consult:async()=>{consultations++;return{status:'succeeded',code:'test_authorized',externalId:'QA'};}};
 const running=dispatch(db,rid,a.id,provider);
 // Wait until the first dispatcher has actually entered transport, then run a competing claimant.
 while(!submissions)await new Promise(r=>setTimeout(r,10));
 assert.equal((await dispatch(other,rid,a.id,provider)).status,'dispatching');release();
 assert.equal((await running).status,'unknown');assert.equal(submissions,1);
 assert.equal((await db.query('SELECT result FROM integration_operations WHERE id=$1',[a.id])).rows[0].result.code,'provider_result_unknown');
 await db.query("UPDATE integration_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[a.id]);
 assert.equal((await dispatch(db,rid,a.id,provider)).status,'succeeded');assert.equal(consultations,1);assert.equal(submissions,1);
 await dispatch(db,rid,a.id,provider);assert.equal(consultations,1);
 await assert.rejects(()=>dispatch(db,rid,a.id,{...provider,enabled:false}));await assert.rejects(()=>dispatch(db,rid2,a.id,provider));await assert.rejects(()=>dispatch(db,rid,a.id,{...provider,environment:'production'}));
 const stale=await prepare(db,{...input,key:'stale-worker'},manager);
 let staleStarted=false,finishStale;
 const staleBarrier=new Promise(resolve=>{finishStale=resolve});
 const slow={...provider,submit:async()=>{staleStarted=true;await staleBarrier;return {status:'pending',code:'old_worker'};}};
 const oldWorker=dispatch(db,rid,stale.id,slow);
 while(!staleStarted)await new Promise(r=>setTimeout(r,10));
 await other.query("UPDATE integration_operations SET lease_until=now()-interval '1 second' WHERE id=$1",[stale.id]);
 assert.equal((await dispatch(other,rid,stale.id,provider)).status,'succeeded');
 finishStale();assert.equal((await oldWorker).status,'succeeded');
 const crashed=await prepare(db,{...input,key:'crashed'},manager);
 await db.query("UPDATE integration_operations SET status='dispatching',attempts=1,lease_until=now()-interval '1 second' WHERE id=$1",[crashed.id]);
 await dispatch(db,rid,crashed.id,provider);assert.equal(submissions,1);assert.equal(consultations,3);
 let calls=0,reply={status:'autorizado',chave_nfe:'1'.repeat(44)},http=201;
 const focus=focusHomologation({restaurantId:rid,issuerCnpj:input.payload.cnpj_emitente,token:'fake-test-only',enabled:true,taxProfileValidated:true},async(url,init)=>{
   calls++;assert.ok(url.startsWith('https://homologacao.focusnfe.com.br/v2/nfce'));assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Basic '+Buffer.from('fake-test-only:').toString('base64'));return new Response(JSON.stringify(reply),{status:http});});
 assert.equal((await focus.submit(a)).status,'succeeded');reply={status:'erro_autorizacao'};assert.equal((await focus.submit(a)).status,'failed');reply={status:'autorizado'};assert.equal((await focus.submit(a)).status,'unknown');
 reply={status:'processando_autorizacao'};assert.equal((await focus.consult(a)).status,'pending');http=404;assert.equal((await focus.consult(a)).status,'unknown');http=200;
 reply={status:'autorizado',chave_nfe:'1'.repeat(44),ref:'other'};assert.equal((await focus.consult(a)).status,'unknown');
 const before=calls;await assert.rejects(()=>focus.submit({...a,restaurant_id:rid2}));await assert.rejects(()=>focus.submit({...a,environment:'production'}));assert.equal(calls,before);
 const disabled=focusHomologation({restaurantId:rid,issuerCnpj:input.payload.cnpj_emitente,token:'fake',enabled:false,taxProfileValidated:true},async()=>{throw new Error('unexpected network');});await assert.rejects(()=>disabled.submit(a));
 let paymentCalls=0;
 const payment=await prepare(db,{...input,kind:'payment',provider:'qa_terminal',key:'payment',payload:pix},waiter);
 const connector=paymentHomologation({id:'qa_terminal',restaurantId:rid,enabled:true,capabilities:[{method:'pix',channel:'terminal'}],
 submit:async req=>{paymentCalls++;return {...req,status:'paid',externalId:'qa-terminal-1'};},
 lookup:async reference=>({reference,amountCents:1000,currency:'BRL',status:'paid',externalId:'qa-terminal-1'})});
 assert.equal((await dispatch(db,rid,payment.id,connector)).status,'succeeded');assert.equal(paymentCalls,1);
 await dispatch(db,rid,payment.id,connector);assert.equal(paymentCalls,1);
 await assert.rejects(()=>connector.submit({...payment,payload:{...pix,channel:'direct'}}));assert.equal(paymentCalls,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM integration_operations')).rows[0].n,5);
 console.log('PASS: isolated PostgreSQL migration/rollback, roles, tenant boundaries, concurrent idempotency, lease recovery, timeout consultation, terminal immutability, Focus controlled transport, payment evidence and capabilities. No external API called.');
} finally {
 await other.end();
 if(created)await db.query(`DROP SCHEMA ${schema} CASCADE`);
 await db.end();
}
