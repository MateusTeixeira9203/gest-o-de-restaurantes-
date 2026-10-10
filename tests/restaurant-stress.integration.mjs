// SIM-20 contract: docs/restaurante-core/SIMULACAO-20-MESAS.md
// Intentional retained fixtures. Never runs against a remote HTTP host.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID, randomBytes, scryptSync} from 'node:crypto';
import {mkdir, writeFile, appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {connect} from '../scripts/database.mjs';
import {createCoreFixture} from './helpers/core-fixture.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3100';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.equal(process.env.RUN_RETAINED_STRESS,'20','Set RUN_RETAINED_STRESS=20 to authorize retained synthetic fixtures.');
const run=new Date().toISOString().replaceAll(':','-');
const dir=`outputs/stress-20/${run}`;await mkdir(dir,{recursive:true});
const db=await connect();let q, timer, polling=false, phase='setup', active=0, peak=0;
const metrics=[], checks=[], orders=[], sessions={}, inflightPolls=new Set();
const report={run,base,sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:process.env.STRESS_ENVIRONMENT||'local next start + configured database; NOT deployed Vercel',checks};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);checks.push({name,status:'PASSA',actual});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function call(label,path,body,cookie,method=body?'POST':'GET',key=randomUUID()){
 const started=Date.now(), phaseAtStart=phase;active++;peak=Math.max(peak,active);
 const result=await new Promise(resolve=>{
  const req=http.request(new URL(base+path),{method,headers:{host:q.slug+'.test','content-type':'application/json','idempotency-key':key,...(cookie?{cookie}:{})}},res=>{
   let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{let body;try{body=JSON.parse(raw);}catch{body={error:'Non-JSON response',preview:raw.slice(0,160)}}resolve({status:res.statusCode,body,bytes:Buffer.byteLength(raw),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});});
  });req.on('error',e=>resolve({status:0,body:{error:e.message},bytes:0}));req.setTimeout(30000,()=>req.destroy(new Error('HTTP timeout 30s')));req.end(body?JSON.stringify(body):undefined);
 });active--;
 const m={phase:phaseAtStart,label,method,path,started:new Date(started).toISOString(),ms:Date.now()-started,status:result.status,bytes:result.bytes,...(result.status>=400||!result.status?{error:result.body.error}: {})};
 metrics.push(m);await appendFile(`${dir}/http.jsonl`,JSON.stringify(m)+'\n');return result;
}
const ok=r=>{assert.ok(r.status>=200&&r.status<300,`HTTP ${r.status}: ${JSON.stringify(r.body)}`);return r.body;};
async function batch(items,fn,limit=20){const results=[];let index=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;try{results[i]={ok:true,value:await fn(items[i],i)}}catch(e){results[i]={ok:false,error:e.message};}}}));const errors=results.filter(r=>!r.ok);if(errors.length)throw new Error(`${errors.length}/${items.length} actions failed: ${errors.map(e=>e.error).join('; ').slice(0,1500)}`);return results.map(r=>r.value);}
async function preserved(){return (await db.query(`SELECT r.id,r.slug,(SELECT count(*) FROM orders WHERE restaurant_id=r.id)::int orders,(SELECT count(*) FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=r.id)::int payments,(SELECT md5(coalesce(string_agg(to_jsonb(o)::text,'' ORDER BY o.id),'')) FROM orders o WHERE o.restaurant_id=r.id) orders_hash,(SELECT md5(coalesce(string_agg(to_jsonb(i)::text,'' ORDER BY i.id),'')) FROM inventory_items i WHERE i.restaurant_id=r.id) inventory_hash,(SELECT count(*) FROM finance_entries WHERE restaurant_id=r.id)::int finance_entries FROM restaurants r WHERE NOT r.slug LIKE 'qa-core-stress%' ORDER BY r.id`)).rows;}
try{
 report.before=await preserved();q=await createCoreFixture(db,'STRESS');
 q.pin=randomBytes(4).readUInt32BE().toString().slice(0,6).padStart(6,'0');
 const salt=randomBytes(16).toString('hex'),hash=scryptSync(q.pin,salt,64).toString('hex');
 await db.query('UPDATE staff_members SET pin_salt=$2,pin_hash=$3 WHERE restaurant_id=$1',[q.id,salt,hash]);
 for(let i=2;i<=20;i++)await db.query('INSERT INTO dining_tables(restaurant_id,number,label) VALUES($1,$2,$3)',[q.id,i,`SIM-20 Mesa ${i}`]);
 const roles=[['waiter2','waiter'],['waiter3','waiter'],['waiter4','waiter'],['kitchen2','kitchen'],['kitchen3','kitchen']];
 for(const [key,role] of roles){q.staff[key]={id:randomUUID(),name:`SIM-20 ${key} ${run}`};await db.query('INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5,$6)',[q.staff[key].id,q.id,q.staff[key].name,role,salt,hash]);}
 const drink={id:randomUUID(),variant:randomUUID(),name:'Bebida SIM-20',sector:'Bar'};q.products.push(drink);
 await db.query("INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,'Bebidas','Bar')",[drink.id,q.id,drink.name]);
 await db.query("INSERT INTO menu_variants(id,product_id,name,price_cents) VALUES($1,$2,'Individual',500)",[drink.variant,drink.id]);
 for(const p of q.products){p.stock=randomUUID();await db.query("INSERT INTO inventory_items(id,restaurant_id,name,unit,quantity,average_cost_cents,cost_known) VALUES($1,$2,$3,'un',1000,200,true)",[p.stock,q.id,`Insumo ${p.name}`]);await db.query('INSERT INTO product_recipe_components(variant_id,inventory_item_id,quantity) VALUES($1,$2,1)',[p.variant,p.stock]);await db.query('UPDATE menu_variants SET recipe_cost_complete=true WHERE id=$1',[p.variant]);await db.query("INSERT INTO inventory_movements(restaurant_id,inventory_item_id,type,quantity_delta,unit_cost_cents,note) VALUES($1,$2,'initial',1000,200,'SIM-20 estoque inicial sintético')",[q.id,p.stock]);}
 await db.query('UPDATE inventory_settings SET enabled=true,enabled_at=now() WHERE restaurant_id=$1',[q.id]);
 report.fixture={id:q.id,slug:q.slug,tables:20,staff:Object.fromEntries(Object.entries(q.staff).map(([k,v])=>[k,v.name])),products:q.products};
 await writeFile(`${dir}/manifest.json`,JSON.stringify(report,null,2));
 console.log('FIXTURE',q.slug,q.id,dir);
 for(const [key,staff] of Object.entries(q.staff)){const res=await call('login','/api/auth/login',{username:staff.name,password:q.pin});ok(res);sessions[key]=res.cookie;}
 const waiters=['waiter','waiter2','waiter3','waiter4'].map(k=>sessions[k]);
 const cooks={Cozinha:sessions.kitchen,Pizzaria:sessions.kitchen2,Bar:sessions.kitchen3};
 const shift=ok(await call('open_shift','/api/operations/finance',{action:'open_shift',openingCents:10000},sessions.manager));report.shiftId=shift.id;
 phase='baseline';for(let i=0;i<5;i++)ok(await call('state_baseline','/api/operations/state',null,waiters[0]));
 polling=true;timer=setInterval(()=>{if(!polling)return;for(const cookie of [...waiters,...Object.values(cooks)]){const p=call('state_poll','/api/operations/state',null,cookie);inflightPolls.add(p);p.finally(()=>inflightPolls.delete(p));}},4000);
 async function createWave(wave){phase=`orders_wave_${wave}`;return batch(Array.from({length:20},(_,i)=>i+1),async table=>{
  const p=q.products[(table+wave)%2],isPublic=wave===1&&table<=5;
  const items=[{productId:p.id,variantId:p.variant,quantity:1+(table%2),note:`SIM-20 rodada ${wave}`},{productId:drink.id,variantId:drink.variant,quantity:2}];
  const cookie=waiters[(table-1)%4],key=randomUUID();
  const payload=isPublic?{source:'qr_menu',fulfillment:'dine_in',tableNumber:table,items,notes:`SIM-20 ${run}`}:{tableNumber:table,sendToKitchen:true,items,notes:`SIM-20 ${run}`};
  const path=isPublic?'/api/public/orders':'/api/operations/orders';
  const order=ok(await call(isPublic?'create_public':'create_waiter',path,payload,isPublic?null:cookie,'POST',key)).order;
  orders.push({id:order.id,table,wave});
  if(isPublic){check(`pending table ${table}`,order.status,'pending');check(`pending effects table ${table}`,(await db.query('SELECT (SELECT count(*)::int FROM kitchen_tickets WHERE order_id=$1) tickets,(SELECT count(*)::int FROM inventory_movements WHERE order_id=$1) movements',[order.id])).rows[0],{tickets:0,movements:0});ok(await call('approve',`/api/operations/orders/${order.id}/approval`,{decision:'approve',revision:1},cookie));}
  if(table===20){check(`retry same order wave ${wave}`,ok(await call('create_retry',path,payload,cookie,'POST',key)).order.id,order.id);}
  return {id:order.id,table,wave};
 });}
 async function kitchenAndServe(group){
  const tickets=(await db.query('SELECT id,order_id,kitchen_sector FROM kitchen_tickets WHERE order_id=ANY($1::uuid[])',[group.map(o=>o.id)])).rows;check('2 sectors per order',tickets.length,group.length*2);
  await Promise.all(Object.entries(cooks).map(async([sector,cookie])=>{for(const ticket of tickets.filter(t=>t.kitchen_sector===sector)){ok(await call('kitchen_preparing',`/api/internal/kitchen/${ticket.id}`,{status:'preparing'},cookie,'PATCH'));await delay(100);ok(await call('kitchen_ready',`/api/internal/kitchen/${ticket.id}`,{status:'ready'},cookie,'PATCH'));}}));
  await batch(group,async o=>ok(await call('serve',`/api/operations/orders/${o.id}/serve`,{},waiters[(o.table-1)%4])));
 }
 const first=await createWave(1);console.log('WAVE1',first.length);
 const overlap=await Promise.allSettled([kitchenAndServe(first),createWave(2)]);
 if(overlap.some(r=>r.status==='rejected'))throw new Error(overlap.filter(r=>r.status==='rejected').map(r=>r.reason.message).join(';'));
 const second=overlap[1].value;console.log('WAVE2',second.length);
 const overlap2=await Promise.allSettled([kitchenAndServe(second),createWave(3)]);
 if(overlap2.some(r=>r.status==='rejected'))throw new Error(overlap2.filter(r=>r.status==='rejected').map(r=>r.reason.message).join(';'));
 await kitchenAndServe(overlap2[1].value);console.log('SERVED',orders.length);
 phase='checkout';await batch(Array.from({length:20},(_,i)=>i+1),async table=>{
  const cookie=waiters[(table-1)%4];let quote=ok(await call('checkout_quote','/api/operations/checkout',{tableNumber:table},cookie));
  if(table%4===0){ok(await call('payment_partial','/api/operations/payments',{tableNumber:table,allowPartial:true,expectedVersion:quote.version,payments:[{method:'Pix',amountCents:Math.floor(quote.dueCents/2)}]},cookie));quote=ok(await call('checkout_requote','/api/operations/checkout',{tableNumber:table},cookie));}
  const method=['Pix','Dinheiro','Débito','Crédito'][(table-1)%4],key=randomUUID(),body={tableNumber:table,allowPartial:true,expectedVersion:quote.version,payments:[{method,amountCents:quote.dueCents}]};
  const paid=ok(await call('payment_final','/api/operations/payments',body,cookie,'POST',key));
  check(`payment retry table ${table}`,ok(await call('payment_retry','/api/operations/payments',body,cookie,'POST',key)),paid);
 });
 polling=false;clearInterval(timer);await Promise.allSettled([...inflightPolls]);
 phase='verification';const state=ok(await call('state_reload','/api/operations/state',null,sessions.manager));check('60 completed after reload',state.orders.filter(o=>o.status==='completed').length,60);
 const cash=Number((await db.query("SELECT coalesce(sum(p.amount_cents),0) cents FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=$1 AND p.method='cash' AND p.status='paid'",[q.id])).rows[0].cents);
 report.close=ok(await call('close_shift','/api/operations/finance',{action:'close_shift',shiftId:shift.id,countedCents:10000+cash,note:`SIM-20 ${run} — simulação retida`},sessions.manager));
 const totals=(await db.query("SELECT (SELECT sum(total_cents) FROM orders WHERE restaurant_id=$1) sales,(SELECT sum(p.amount_cents) FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=$1 AND p.status='paid') received,(SELECT sum(debit_cents-credit_cents) FROM finance_lines WHERE restaurant_id=$1) balance,(SELECT counted_cents-expected_cents FROM cash_shifts WHERE id=$2) cash_difference",[q.id,shift.id])).rows[0];
 check('all receipts match sales',Number(totals.received),Number(totals.sales));check('balanced journal',Number(totals.balance),0);check('cash count matches',Number(totals.cash_difference),0);
 for(const p of q.products){const consumed=Number((await db.query('SELECT sum(oi.quantity) amount FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.restaurant_id=$1 AND oi.variant_id=$2',[q.id,p.variant])).rows[0].amount);check('stock preserved '+p.name,Number((await db.query('SELECT quantity FROM inventory_items WHERE id=$1',[p.stock])).rows[0].quantity),1000-consumed);}
 report.status='PASSA';
}catch(e){report.status='NÃO PASSA';report.failure={phase,error:e.message};console.error('STOP',phase,e.message);process.exitCode=1;}
finally{
 polling=false;clearInterval(timer);await Promise.allSettled([...inflightPolls]);
 if(q){
  report.database={};
  const queries={orders:'SELECT status,count(*)::int n,sum(total_cents)::int cents FROM orders WHERE restaurant_id=$1 GROUP BY status',tickets:'SELECT status,count(*)::int n FROM kitchen_tickets WHERE restaurant_id=$1 GROUP BY status',payments:"SELECT p.method,count(*)::int n,sum(p.amount_cents)::int cents FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.restaurant_id=$1 AND p.status='paid' GROUP BY p.method",inventory:'SELECT name,quantity FROM inventory_items WHERE restaurant_id=$1 ORDER BY name',events:'SELECT e.event_type,count(*)::int n FROM order_events e JOIN orders o ON o.id=e.order_id WHERE o.restaurant_id=$1 GROUP BY e.event_type',journal:'SELECT sum(debit_cents-credit_cents)::int balance,count(*)::int lines FROM finance_lines WHERE restaurant_id=$1',shifts:'SELECT * FROM cash_shifts WHERE restaurant_id=$1'};
  for(const [key,sql] of Object.entries(queries))try{report.database[key]=(await db.query(sql,[q.id])).rows;}catch(e){report.database[key]={error:e.message};}
  report.after=await preserved();report.preserved=JSON.stringify(report.before)===JSON.stringify(report.after);if(!report.preserved){report.status='NÃO PASSA';report.failure={phase:'preservation',error:'Preexisting records changed'};process.exitCode=1;}
 }
 const quant=(v,p)=>v[Math.max(0,Math.ceil(v.length*p)-1)]??0;
 report.peakConcurrentHttp=peak;report.metrics=Object.fromEntries([...new Set(metrics.map(m=>m.label))].map(label=>{const rows=metrics.filter(m=>m.label===label),v=rows.map(m=>m.ms).sort((a,b)=>a-b);return[label,{count:v.length,errors:rows.filter(r=>r.status>=400||!r.status).length,p50:quant(v,.5),p95:quant(v,.95),max:quant(v,1),maxBytes:Math.max(...rows.map(r=>r.bytes))}]}));
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await writeFile('outputs/stress-20/latest.json',JSON.stringify({dir,id:q?.id,slug:q?.slug},null,2));await db.end();console.log(JSON.stringify({dir,status:report.status,failure:report.failure,metrics:report.metrics,database:report.database,preserved:report.preserved},null,2));
}
