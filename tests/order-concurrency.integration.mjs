import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {createCoreFixture,cleanupCoreFixture} from './helpers/core-fixture.mjs';
// Explicit local socket only. Never runs its concurrency waves on the shared Neon database.
const socket=process.env.LOCAL_QA_PG_SOCKET;if(!socket)throw new Error('LOCAL_QA_PG_SOCKET required');
const db=new pg.Client({host:socket,port:55433,user:'mtx',database:'postgres'});await db.connect();let q;
async function call(path,body,cookie,key=randomUUID()){
 return new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:3100'+path,{method:body?'POST':'GET',headers:{host:q.slug+'.test','content-type':'application/json','idempotency-key':key,...(cookie?{cookie}:{})}},res=>{let raw='';res.on('data',c=>raw+=c);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(30000,()=>req.destroy(new Error('Timeout')));req.end(body?JSON.stringify(body):undefined);});
}
function ok(r){assert.ok(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body;}
try{
 q=await createCoreFixture(db,'LOCKS');
 const manager=await call('/api/auth/login',{username:q.staff.manager.name,password:q.pin});ok(manager);
 const waiter=await call('/api/auth/login',{username:q.staff.waiter.name,password:q.pin});ok(waiter);
 const p=q.products[0],stock=randomUUID();
 await db.query("INSERT INTO inventory_items(id,restaurant_id,name,unit,quantity,average_cost_cents,cost_known) VALUES($1,$2,'QA locking','un',1000,100,true)",[stock,q.id]);
 await db.query('INSERT INTO product_recipe_components(variant_id,inventory_item_id,quantity) VALUES($1,$2,1)',[p.variant,stock]);await db.query('UPDATE inventory_settings SET enabled=true WHERE restaurant_id=$1',[q.id]);
 let expected=0;
 for(let wave=0;wave<3;wave++){
  const pendings=[];
  for(let i=0;i<5;i++)pendings.push(ok(await call('/api/public/orders',{source:'qr_menu',fulfillment:'dine_in',tableNumber:1,items:[{productId:p.id,variantId:p.variant,quantity:1}]})).order);
  const actions=[...pendings.map(o=>()=>call(`/api/operations/orders/${o.id}/approval`,{decision:'approve',revision:1},manager.cookie)),...Array.from({length:15},()=>()=>call('/api/operations/orders',{tableNumber:1,sendToKitchen:true,items:[{productId:p.id,variantId:p.variant,quantity:1}]},waiter.cookie))];
  (await Promise.all(actions.map(f=>f()))).forEach(ok);expected+=20;
  const count=(await db.query("SELECT count(*)::int n,count(DISTINCT queue_number)::int queues,count(DISTINCT order_number)::int numbers FROM orders WHERE restaurant_id=$1 AND status='confirmed'",[q.id])).rows[0];assert.deepEqual(count,{n:expected,queues:expected,numbers:expected});
  assert.equal(Number((await db.query('SELECT quantity FROM inventory_items WHERE id=$1',[stock])).rows[0].quantity),1000-expected);
 }
 assert.equal((await db.query('SELECT count(*)::int n FROM kitchen_tickets WHERE restaurant_id=$1',[q.id])).rows[0].n,60);
 assert.equal((await db.query("SELECT count(*)::int n FROM inventory_movements WHERE restaurant_id=$1 AND type='sale_consumption'",[q.id])).rows[0].n,60);
 console.log('PASS: 3 waves x 20 simultaneous approvals/creates; 60 unique orders/queues/tickets and 60 stock effects, isolated local PostgreSQL.');
 // Last unit: two independent intents must not oversell or leave partial effects.
 await db.query('UPDATE inventory_items SET quantity=1 WHERE id=$1',[stock]);
 const lastUnit=await Promise.all(Array.from({length:2},()=>call('/api/operations/orders',{tableNumber:1,sendToKitchen:true,items:[{productId:p.id,variantId:p.variant,quantity:1}]},waiter.cookie)));
 assert.deepEqual(lastUnit.map(r=>r.status).sort(),[201,400]);
 assert.match(lastUnit.find(r=>r.status===400).body.error,/Estoque insuficiente/);
 assert.equal(Number((await db.query('SELECT quantity FROM inventory_items WHERE id=$1',[stock])).rows[0].quantity),0);
 assert.equal((await db.query('SELECT count(*)::int n FROM orders WHERE restaurant_id=$1',[q.id])).rows[0].n,61);
 const pending=ok(await call('/api/public/orders',{source:'qr_menu',fulfillment:'dine_in',tableNumber:1,items:[{productId:p.id,variantId:p.variant,quantity:1}]})).order;
 const denied=await call(`/api/operations/orders/${pending.id}/approval`,{decision:'approve',revision:1},manager.cookie);
 assert.equal(denied.status,400);assert.match(denied.body.error,/Estoque insuficiente/);
 assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[pending.id])).rows[0].status,'pending');
 assert.equal((await db.query('SELECT count(*)::int n FROM kitchen_tickets WHERE restaurant_id=$1',[q.id])).rows[0].n,61);
 assert.equal((await db.query("SELECT count(*)::int n FROM inventory_movements WHERE restaurant_id=$1 AND type='sale_consumption'",[q.id])).rows[0].n,61);
 assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE restaurant_id=$1',[q.id])).rows[0].n,0);
 console.log('PASS: last-unit race accepts exactly one order; insufficient-stock approval remains pending; no negative stock, orphan ticket or financial effect.');
}catch(e){console.error('Concurrency QA failed:',e.message);throw e;}finally{if(q){await db.query('DELETE FROM product_recipe_components WHERE inventory_item_id IN (SELECT id FROM inventory_items WHERE restaurant_id=$1)',[q.id]);await cleanupCoreFixture(db,q);}await db.end();}
