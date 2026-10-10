import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
import './helpers/typescript-source.mjs';
const fiscal=await import('../modules/fiscal/service.ts');
const {collectFiles,focusFileUrl}=await import('../modules/fiscal/resources.ts');
const {database}=await import('../lib/database.ts');
assert.throws(()=>focusFileUrl('https://other.invalid/arquivos/qa.xml'));assert.throws(()=>focusFileUrl('/v2/nfce/secret'));
const db=await connect(),originalFetch=globalThis.fetch;let q;
const actor={role:'cashier',name:'QA Fiscal'},key='3'.repeat(44);let sends=0,cancels=0,ref='',cancelled=false,unknown=true;
try{
 q=await createCoreFixture(db,'FISCALFLOW');
 process.env.FOCUS_NFE_HOMOLOGATION_ENABLED='true';process.env.FOCUS_NFE_HOMOLOGATION_TOKENS=JSON.stringify({[q.id]:'synthetic-test-token'});
 globalThis.fetch=async(input,options={})=>{
  assert.equal(options.redirect,'error');const u=new URL(input);assert.equal(u.origin,'https://homologacao.focusnfe.com.br');
  if(u.pathname.startsWith('/arquivos/'))return new Response(u.pathname.endsWith('.pdf')?Buffer.from('%PDF-1.4 QA SEM VALIDADE FISCAL'):Buffer.from(`<QA>SEM VALIDADE FISCAL ${key}</QA>`));
  if(options.method==='POST'){sends++;ref=u.searchParams.get('ref');const body=JSON.parse(options.body);assert.ok(Math.abs(Date.now()-Date.parse(body.data_emissao))<10000);assert.equal(body.items[0].valor_bruto,'20.00');if(unknown){unknown=false;throw new Error('Synthetic timeout after acceptance');}}
  if(options.method==='DELETE'){cancels++;cancelled=true;}
  return Response.json({status:cancelled?'cancelado':'autorizado',ref,cnpj_emitente:'12345678000123',chave_nfe:key,caminho_xml_nota_fiscal:'/arquivos/qa.xml',caminho_danfe:'/arquivos/qa.pdf',...(cancelled?{caminho_xml_cancelamento:'/arquivos/cancel.xml'}:{})});
 };
 await fiscal.saveIssuer(q.id,{cnpj:'12345678000123',legalName:'QA Fiscal',ie:'123',regime:'1',accountant:'QA',reviewed:true,presentialApproved:true},actor);
 await fiscal.saveTax(q.id,q.products[0].id,{ncm:'19059090',cfop:'5102',origin:'0',icms:'102',pis:'07',cofins:'07',cest:'',reviewed:true},actor);
 const sale=randomUUID();await db.query("INSERT INTO orders(id,restaurant_id,order_number,queue_number,source,fulfillment,status,table_id,subtotal_cents,total_cents) VALUES($1,$2,500,500,'waiter','dine_in','completed',$3,2000,2000)",[sale,q.id,q.table]);
 await db.query("INSERT INTO order_items(order_id,product_id,variant_id,product_name,variant_name,kitchen_sector,quantity,unit_price_cents) VALUES($1,$2,$3,'QA','Individual','Cozinha',1,2000)",[sale,q.products[0].id,q.products[0].variant]);
 await db.query("INSERT INTO payments(order_id,method,amount_cents,status,paid_at) VALUES($1,'cash',2000,'paid',now())",[sale]);
 const {id}=await fiscal.prepareDocument(q.id,[sale],randomUUID(),actor);
 assert.equal((await fiscal.processDocument(q.id,id,actor)).status,'unknown');assert.equal(sends,1);
 await db.query("UPDATE integration_operations SET lease_until=now()-interval '1 second' WHERE restaurant_id=$1",[q.id]);
 assert.equal((await fiscal.processDocument(q.id,id,actor)).status,'succeeded');assert.equal(sends,1,'timeout must query, never resubmit');
 await assert.rejects(()=>fiscal.refreshDocument(q.id,id,actor),/não pode ser alterado/);
 assert.deepEqual((await collectFiles(q.id,id)).saved,['xml','auxiliary']);
 assert.equal((await fiscal.cancelDocument(q.id,id,'Cancelamento sintético de homologação',actor)).status,'succeeded');
 await fiscal.cancelDocument(q.id,id,'Cancelamento sintético de homologação',actor);assert.equal(cancels,1);
 assert.deepEqual((await collectFiles(q.id,id)).saved,['xml','auxiliary','cancellation']);
 assert.equal((await fiscal.fiscalOverview(q.id)).documents[0].status,'cancelled');
 assert.equal((await db.query('SELECT count(*)::int n FROM fiscal_files WHERE restaurant_id=$1',[q.id])).rows[0].n,3);
 assert.equal((await db.query('SELECT count(*)::int n FROM payments WHERE order_id=$1',[sale])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 console.log('PASS: persisted fiscal preparation → timeout → consultation without duplicate submission → authorization → private XML/PDF → cancellation once → cancellation file; financial records unchanged. Focus transport mocked, NOT external homologation.');
}finally{globalThis.fetch=originalFetch;if(q)await cleanupCoreFixture(db,q);await db.end();await database.end();}
