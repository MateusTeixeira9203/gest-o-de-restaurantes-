import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { connect } from '../scripts/database.mjs';
const db=await connect();
const base=process.env.TEST_BASE_URL||'http://localhost:3000';
const prefix=`QA-${randomUUID().slice(0,8)}`;
const ids={product:randomUUID(),variant:randomUUID(),ingredient:randomUUID(),cashier:randomUUID(),kitchen:randomUUID()};
const orderIds=[];
async function call(path,body,cookie,key,method='POST') {
 const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
try {
 const rid=(await db.query('SELECT id FROM restaurants WHERE slug=$1',[process.env.RESTAURANT_SLUG||'patos-lanches'])).rows[0].id;
 await db.query('INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,$4,$4)',[ids.product,rid,prefix,'QA']);
 await db.query("INSERT INTO menu_variants(id,product_id,name,price_cents) VALUES($1,$2,'QA',1000)",[ids.variant,ids.product]);
 await db.query("INSERT INTO inventory_items(id,restaurant_id,name,unit,quantity,average_cost_cents) VALUES($1,$2,$3,'un',100,200)",[ids.ingredient,rid,prefix]);
 await db.query('INSERT INTO product_recipe_components(variant_id,inventory_item_id,quantity) VALUES($1,$2,1)',[ids.variant,ids.ingredient]);
 const pin=randomBytes(3).readUIntBE(0,3).toString().slice(0,6).padStart(6,'0');
 for(const role of ['cashier','kitchen']) {const salt=randomBytes(16).toString('hex');await db.query('INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5,$6)',[ids[role],rid,`${prefix}-${role}`,role,salt,scryptSync(pin,salt,64).toString('hex')]);}
 const cashier=await call('/api/auth/login',{username:`${prefix}-cashier`,password:pin});assert.equal(cashier.status,200);
 const kitchen=await call('/api/auth/login',{username:`${prefix}-kitchen`,password:pin});assert.equal(kitchen.status,200);
 const payload={source:'public_menu',fulfillment:'pickup',customer:{name:prefix},items:[{productId:ids.product,variantId:ids.variant,quantity:1}]};
 const key=randomUUID(); const created=await call('/api/public/orders',payload,null,key);assert.equal(created.status,201,JSON.stringify(created.body)); const id=created.body.order.id;orderIds.push(id);
 assert.equal(created.body.order.status,'pending');assert.equal(created.body.order.queueNumber,null);
 const effects=async()=> (await db.query('SELECT (SELECT count(*)::int FROM kitchen_tickets WHERE order_id=$1) AS tickets,(SELECT count(*)::int FROM inventory_movements WHERE order_id=$1) AS movements',[id])).rows[0];
 assert.deepEqual(await effects(),{tickets:0,movements:0});
 const repeated=await call('/api/public/orders',payload,null,key);assert.equal(repeated.body.order.id,id);
 assert.equal((await call('/api/public/orders',{...payload,notes:'different'},null,key)).status,400);
 const review={decision:'approve',revision:1};
 assert.equal((await call(`/api/operations/orders/${id}/approval`,review)).status,403);
 assert.equal((await call(`/api/operations/orders/${id}/approval`,review,kitchen.cookie)).status,403);
 assert.equal((await call(`/api/operations/orders/${id}/payment`,{method:'Pix'},cashier.cookie)).status,400);
 const concurrent=await Promise.all([call(`/api/operations/orders/${id}/approval`,review,cashier.cookie),call(`/api/operations/orders/${id}/approval`,review,cashier.cookie)]);
 concurrent.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.body)));
 assert.equal((await effects()).tickets,1);
 const enabled=(await db.query('SELECT enabled FROM inventory_settings WHERE restaurant_id=$1',[rid])).rows[0].enabled;
 assert.equal((await effects()).movements,enabled?1:0);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND event_type='order_approved'",[id])).rows[0].n,1);
 const second=await call('/api/public/orders',payload,null,randomUUID());const rejectedId=second.body.order.id;orderIds.push(rejectedId);
 assert.equal((await call(`/api/operations/orders/${rejectedId}/approval`,{decision:'reject',revision:1,reason:'QA cancelamento'},cashier.cookie)).status,200);
 await db.query('UPDATE staff_members SET active=false WHERE id=$1',[ids.cashier]);
 assert.equal((await call('/api/operations/state',null,cashier.cookie,null,'GET')).status,401);
 console.log('PASS: public pending, isolation from kitchen/stock, retry idempotency, conflicting intent, authorization, concurrent approval, rejection and session revocation.');
} finally {
 if(orderIds.length){await db.query('DELETE FROM inventory_movements WHERE order_id=ANY($1::uuid[])',[orderIds]);await db.query('DELETE FROM orders WHERE id=ANY($1::uuid[])',[orderIds]);}
 await db.query('DELETE FROM menu_products WHERE id=$1',[ids.product]);await db.query('DELETE FROM inventory_items WHERE id=$1',[ids.ingredient]);await db.query('DELETE FROM staff_members WHERE id=ANY($1::uuid[])',[[ids.cashier,ids.kitchen]]);await db.end();
}
