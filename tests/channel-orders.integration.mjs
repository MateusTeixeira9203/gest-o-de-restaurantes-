// Só rode integração com o banco confirmado: ep-square-dawn-b6qhiaxp. --unit não acessa banco.
import assert from 'node:assert/strict';
import {randomUUID, randomBytes, scryptSync, createHash} from 'node:crypto';

// --unit executes the real routes and payment helper with simulated dependencies only.
async function unit() {
  const {registerHooks} = await import('node:module');
  const {readFileSync} = await import('node:fs');
  const {execFileSync} = await import('node:child_process');
  let captured, role = 'cashier';
  const stub = 'data:text/javascript,' + encodeURIComponent(`
    export const createOrder = (...args) => globalThis.channelTest.create(...args);
    export const recordExternalPayment = (...args) => globalThis.channelTest.recordPayment(...args);
    export const hasStaffSession = async () => true;
    export const sessionFromRequest = async () => ({role:globalThis.channelTest.role(),username:'Sintético'});
    export const getOperationSnapshot = async () => globalThis.channelTest.snapshot;
    export const query = (...args) => globalThis.channelTest.query(...args);
    export const updateRestaurantSettings = input => globalThis.channelTest.updateSettings(input);
    export const transaction = callback => globalThis.channelTest.transaction(callback);
    export const restaurantContext = () => ({id:'synthetic-tenant',service_rate_basis_points:1000});
    export const accountVersion = () => {};
    export const snapshotRecipeCost = () => {};
    export const recognizeSale = () => {};
    export const postSalePayment = (...args) => globalThis.channelTest.salePayment?.(...args);
    export const assertOrderApprover = () => {};
    export const requestHash = value => JSON.stringify(value);
  `);
  const privateOrder = {id:'synthetic',status:'confirmed',fulfillment:'delivery',delivery:{addressLine1:'Sentinela'},customerPhone:'999999999',payments:[{}],paidCents:100,expectedPaymentMethod:'cash',cashTenderedCents:10000,changeCents:3700};
  globalThis.channelTest = {create: async input => {captured = input; return input;}, role:()=>role, snapshot:{orders:[privateOrder,{...privateOrder,id:'synthetic-table',fulfillment:'dine_in'}],kitchen:[],tables:[]}};
  const hook = registerHooks({resolve(specifier, context, next) {
    return specifier.startsWith('@/') ? {url:stub,shortCircuit:true} : next(specifier,context);
  }, load(url, context, next) {
    if (url.endsWith('/lib/restaurant-repository.ts')) return {format:'module-typescript',source:(process.argv.includes('--before-payment') ? execFileSync('git',['show','HEAD:lib/restaurant-repository.ts'],{encoding:'utf8'}) : readFileSync(new URL(url),'utf8'))+'\nexport {deliveryPayment};',shortCircuit:true};
    return next(url,context);
  }});
  try {
    const {POST} = await import('../app/api/operations/orders/route.ts');
    const {POST:publicPost} = await import('../app/api/public/orders/route.ts');
    const {GET} = await import('../app/api/operations/state/route.ts');
    const {deliveryPayment, createOrder:realCreate, getOperationSnapshot:realSnapshot, updateRestaurantSettings:realSettings, recordExternalPayment:realPayment} = await import('../lib/restaurant-repository.ts');
    const {POST:paymentPost} = await import('../app/api/operations/orders/[orderId]/payment/route.ts');
    const {PATCH:settingsPatch} = await import('../app/api/operations/settings/route.ts');
    const items = [{productId:randomUUID(),variantId:randomUUID(),quantity:1}];
    const delivery = {fulfillment:'delivery',sendToKitchen:true,items,customer:{name:'Sintético',phone:'999999999'},delivery:{addressLine1:'Rua sintética 123'},expectedPaymentMethod:'cash',deliveryFeeCents:300,cashTenderedCents:10000};
    const request = body => new Request('http://localhost/api/orders',{method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify(body)});
    assert.equal((await POST(request({items,tableNumber:4,sendToKitchen:true}))).status,201);
    assert.equal(captured.fulfillment,'dine_in');
    assert.equal((await POST(request({items,sendToKitchen:true,fulfillment:'pickup',customer:{name:'Sintético'}}))).status,201);
    assert.equal((await POST(request(delivery))).status,201);
    for (const body of [{...delivery,customer:undefined},{...delivery,delivery:undefined},{...delivery,expectedPaymentMethod:undefined},{...delivery,expectedPaymentMethod:'pix'},{...delivery,deliveryFeeCents:20001},{...delivery,deliveryFeeCents:2147483648},{...delivery,deliveryFeeCents:1e20},{...delivery,cashTenderedCents:1000001},{...delivery,cashTenderedCents:2147483648}]) {
      captured = null; assert.equal((await POST(request(body))).status,400); assert.equal(captured,null);
    }
    assert.deepEqual(await deliveryPayment({...delivery,source:'waiter'},'synthetic',6000,{}),{fee:300,method:'cash',tendered:10000});
    await assert.rejects(deliveryPayment({...delivery,source:'waiter',cashTenderedCents:5000},'synthetic',6000,{}),/maior ou igual/);
    assert.equal((await deliveryPayment({...delivery,source:'waiter',deliveryFeeCents:undefined},'synthetic',6000,{query:async()=>({rows:[{default_delivery_fee_cents:400}]})})).fee,400);
    assert.deepEqual(await deliveryPayment({...delivery,source:'public_menu'},'synthetic',6000,{query:async()=>({rows:[{default_delivery_fee_cents:400}]})}),{fee:400,method:null,tendered:null});
    assert.equal((await publicPost(request({...delivery,source:'public_menu',deliveryFeeCents:0}))).status,201);
    for (const key of ['deliveryFeeCents','expectedPaymentMethod','cashTenderedCents']) assert.ok(!(key in captured));
    const statements = [];
    let saved;
    globalThis.channelTest.transaction = callback => callback({query:async (sql, values) => {
      statements.push({sql,values});
      if(sql.includes('SELECT id, request_hash')) return {rows:[]};
      if(sql.includes('FROM dining_tables')) return {rows:[{id:'synthetic-table'}]};
      if(sql.startsWith('SELECT v.id')) return {rows:[{id:items[0].variantId,product_id:items[0].productId,name:'Padrão',product_name:'Sintético',kitchen_sector:'Cozinha',price_cents:6000,available:true}]};
      if(sql.includes('SELECT default_delivery_fee_cents')) return {rows:[{default_delivery_fee_cents:300}]};
      if(sql.startsWith('UPDATE restaurant_counters')) return {rows:[{order_number:'42'}]};
      if(sql.startsWith('INSERT INTO orders')) {saved={id:'synthetic-order',order_number:'42',queue_number:null,total_cents:values[10],status:'pending',revision:1};return {rows:[{id:saved.id}]};}
      if(sql.startsWith('SELECT id,order_number')) return {rows:[saved]};
      if(sql.startsWith('INSERT INTO ') || sql.includes('pg_advisory_xact_lock')) return {rows:[]};
      throw Error('Unexpected SQL in unit simulation: '+sql);
    }});
    for(const fulfillment of ['dine_in','pickup','delivery']) {
      statements.length=0;
      const result=await realCreate({...delivery,source:'waiter',fulfillment,tableNumber:fulfillment==='dine_in'?4:undefined},{idempotencyKey:randomUUID()});
      assert.equal(result.totalCents,{dine_in:6600,pickup:6000,delivery:6300}[fulfillment]);
      const detail=statements.find(statement=>statement.sql.startsWith('INSERT INTO delivery_details'));
      if(fulfillment==='delivery') assert.deepEqual(detail.values.slice(-2),['cash',10000]); else assert.equal(detail,undefined);
    }
    statements.length=0;
    await assert.rejects(realCreate({...delivery,source:'waiter',cashTenderedCents:5000},{idempotencyKey:randomUUID()}),/maior ou igual/);
    assert.ok(!statements.some(statement=>statement.sql.startsWith('INSERT INTO')));
    for (role of ['kitchen','waiter','cashier','delivery','manager']) {
      const body = await (await GET(new Request('http://localhost/api/state'))).json();
      for (const order of body.orders) {
        for (const key of ['expectedPaymentMethod','cashTenderedCents','changeCents']) assert.equal(order[key],['kitchen','waiter'].includes(role) ? null : privateOrder[key]);
        assert.equal(order.delivery === null,!['delivery','manager'].includes(role));
      }
    }
    let snapshotTendered = 5000;
    globalThis.channelTest.query = async sql => {
      if(sql.includes('SELECT default_delivery_fee_cents')) return {rows:[{default_delivery_fee_cents:300}]};
      if(sql.includes('GROUP BY o.id, t.number')) return {rows:[{id:'synthetic',cash_tendered_cents:snapshotTendered,total_cents:6300,items:[],payments:[]}]};
      return {rows:[]};
    };
    for(const [value,expected] of [[5000,0],[10000,3700],[null,null]]) {snapshotTendered=value;assert.equal((await realSnapshot()).orders[0].changeCents,expected,'troco não negativo; nulo permanece nulo');}
    globalThis.channelTest.updateSettings = input => input;
    const settings = {name:'Sintético',whatsapp:'',serviceRate:10};
    for(const value of [20001,2147483648,1e20]) {const badSettings = await settingsPatch(request({...settings,defaultDeliveryFeeCents:value}));assert.equal(badSettings.status,400,'configuração rejeita taxa acima do teto');assert.ok((await badSettings.json()).error.includes('R$ 200,00'));}
    for(const value of [20001,2147483648,1e20,-1,1.5]) await assert.rejects(realSettings({...settings,defaultDeliveryFeeCents:value}),/taxa de entrega/);
    globalThis.channelTest.query = async (sql,values) => {
      assert.ok(sql.includes('default_delivery_fee_cents = COALESCE($5,default_delivery_fee_cents)'));
      return {rows:[{name:values[1],whatsapp:values[2],service_rate_basis_points:values[3],default_delivery_fee_cents:values[4] ?? 300}]};
    };
    assert.equal((await realSettings({...settings,defaultDeliveryFeeCents:20000})).defaultDeliveryFeeCents,20000);
    assert.equal((await realSettings(settings)).defaultDeliveryFeeCents,300,'corpo antigo preserva a taxa');
    const paymentWrites = [], ledgerAmounts = [];
    let paidCents = 0;
    globalThis.channelTest.recordPayment = realPayment;
    globalThis.channelTest.salePayment = (...args) => ledgerAmounts.push(args[5]);
    globalThis.channelTest.transaction = callback => callback({query:async(sql,values) => {
      if(sql.startsWith('SELECT o.id')) {
        assert(sql.includes('o.restaurant_id = $2 FOR UPDATE'));
        assert.equal(values[1],'synthetic-tenant');
        return {rows:[{id:'synthetic-cash',status:'confirmed',fulfillment:'delivery',total_cents:6300,paid_cents:paidCents}]};
      }
      paymentWrites.push({sql,values});
      return {rows:sql.startsWith('INSERT INTO payments') ? [{id:'synthetic-payment'}] : []};
    }});
    role = 'delivery';
    const receive = body => paymentPost(request(body),{params:Promise.resolve({orderId:'synthetic-cash'})});
    for(const [body,message] of [
      [{method:'Pix',receivedCents:10000},'Valor entregue só para pagamento em dinheiro.'],
      [{method:'Dinheiro',receivedCents:5000},'maior ou igual ao total'],
      [{method:'Dinheiro',receivedCents:1000001},'no máximo R$ 10.000,00'],
      ...[1.5,-1,null,'10000'].map(receivedCents=>[{method:'Dinheiro',receivedCents},'']),
    ]) {
      paymentWrites.length=0;ledgerAmounts.length=0;
      const response=await receive(body);
      assert.equal(response.status,400);
      assert((await response.json()).error.includes(message));
      assert.equal(paymentWrites.length,0,'recusa não grava pagamento/evento');
      assert.equal(ledgerAmounts.length,0,'recusa não lança no razão');
    }
    const cashResponse=await receive({method:'Dinheiro',receivedCents:10000});
    assert.equal(cashResponse.status,200);
    assert.equal((await cashResponse.json()).changeCents,3700);
    assert.deepEqual(paymentWrites.find(row=>row.sql.startsWith('INSERT INTO payments')).values,['synthetic-cash','cash',6300,10000,3700]);
    assert.deepEqual(ledgerAmounts,[6300],'razão recebe só o líquido');
    const event=JSON.parse(paymentWrites.find(row=>row.sql.startsWith('INSERT INTO order_events')).values[2]);
    assert.equal(event.receivedCents,10000);assert.equal(event.changeCents,3700);assert.equal(event.amountCents,6300);
    for(const method of ['Dinheiro','Pix']) {
      paymentWrites.length=0;ledgerAmounts.length=0;
      assert.equal((await receive({method})).status,200);
      assert.deepEqual(paymentWrites.find(row=>row.sql.startsWith('INSERT INTO payments')).values.slice(2),[6300,6300,0]);
    }
    paymentWrites.length=0;paidCents=6300;
    const duplicate=await receive({method:'Dinheiro',receivedCents:10000});
    assert.equal(duplicate.status,400);assert.equal((await duplicate.json()).error,'Este pedido já está pago.');assert.equal(paymentWrites.length,0);
    paidCents=800;paymentWrites.length=0;ledgerAmounts.length=0;
    assert.equal((await receive({method:'Dinheiro',receivedCents:10000})).status,200);
    assert.deepEqual(paymentWrites.find(row=>row.sql.startsWith('INSERT INTO payments')).values.slice(2),[5500,10000,4500]);
    assert.deepEqual(ledgerAmounts,[5500]);
    console.log('PASS GF-028d unit: dinheiro 100/63/37; líquido no razão; eventos; Pix/menor/teto/tipos recusados sem escrita; corpo antigo; já pago; saldo parcial (sem banco).');
    console.log('PASS unit: discriminated channels, legacy body, required fields, caps, cash validation, default fee, persisted fees/payment intent, service by channel, public stripping, role visibility, settings cap/legacy settings and nonnegative change (no database).');
  } finally {hook.deregister(); delete globalThis.channelTest;}
}

async function integration() {
  const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
  assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Somente servidor local.');
  const {connect} = await import('../scripts/database.mjs');
  const db = await connect();
  const ids = {product:randomUUID(),variant:randomUUID(),table:randomUUID(),...Object.fromEntries(['waiter','cashier','kitchen','manager','delivery'].map(role=>[role,randomUUID()]))};
  const orders = [], prefix = `qa-channel-${randomUUID().slice(0,8)}`, cookies = {};
  let rid;
  const call = async (path, body, role, key, method = 'POST') => {
    const response = await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookies[role]?{cookie:cookies[role]}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    const columns = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (table_name,column_name) IN (('delivery_details','expected_payment_method'),('delivery_details','cash_tendered_cents'),('restaurants','default_delivery_fee_cents'))")).rows;
    assert.equal(columns.length,3,'0019 não aplicada'); // No writes before preflight.
    const current = (await db.query("SELECT id,default_delivery_fee_cents,service_rate_basis_points FROM restaurants WHERE slug='cantina-modelo'")).rows[0];
    assert.ok(current,'Cantina Modelo ausente'); rid=current.id;
    const shift=(await db.query('SELECT id FROM cash_shifts WHERE restaurant_id=$1 AND closed_at IS NULL',[rid])).rows[0];
    assert.ok(shift,'GF-028d exige caixa já aberto; o teste não cria turno.');
    await db.query("INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,'QA','Cozinha')",[ids.product,rid,prefix]);
    await db.query("INSERT INTO menu_variants(id,product_id,name,price_cents,packaging_cost_cents,recipe_cost_complete) VALUES($1,$2,'Sintético',6000,0,true)",[ids.variant,ids.product]);
    const number = (await db.query('SELECT n FROM generate_series(150,200) n WHERE NOT EXISTS(SELECT 1 FROM dining_tables WHERE restaurant_id=$1 AND number=n) ORDER BY (n=199) DESC,n LIMIT 1',[rid])).rows[0]?.n;
    assert.ok(number,'Sem mesa livre de 150 a 200');
    await db.query('INSERT INTO dining_tables(id,restaurant_id,number) VALUES($1,$2,$3)',[ids.table,rid,number]);
    const pin = randomBytes(3).readUIntBE(0,3).toString().slice(0,6).padStart(6,'0');
    for (const role of Object.keys(ids).filter(role=>!['product','variant','table'].includes(role))) {
      const salt=randomBytes(16).toString('hex');
      await db.query('INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5,$6)',[ids[role],rid,`${prefix}-${role}`,role,salt,scryptSync(pin,salt,64).toString('hex')]);
    }
    await new Promise(resolve=>setTimeout(resolve,2500));
    for (const role of ['waiter','cashier','kitchen','manager','delivery']) {
      const response=await call('/api/auth/login',{username:`${prefix}-${role}`,password:pin}); assert.equal(response.status,200); cookies[role]=response.cookie;
    }
    const items=[{productId:ids.product,variantId:ids.variant,quantity:1}];
    const delivery={fulfillment:'delivery',customer:{name:prefix,phone:'31999990000'},delivery:{addressLine1:'Rua sintética 123',reference:prefix},deliveryFeeCents:300,expectedPaymentMethod:'pix',items,sendToKitchen:true};
    async function create(body,role='cashier',path='/api/operations/orders',key=randomUUID()) {
      const response=await call(path,body,role,key);
      if(response.body.order?.id) orders.push(response.body.order.id);
      assert.equal(response.status,201,JSON.stringify(response.body)); return response.body.order;
    }
    const pix=await create(delivery); assert.equal(pix.totalCents,6300);
    const cash=await create({...delivery,expectedPaymentMethod:'cash',cashTenderedCents:10000});
    async function state(role) {const response=await call('/api/operations/state',null,role,null,'GET');assert.equal(response.status,200);return response.body;}
    const snapshot=await state('cashier');
    assert.equal(snapshot.orders.find(order=>order.id===cash.id).changeCents,3700);
    assert.equal(snapshot.orders.find(order=>order.id===pix.id).status,'confirmed');
    assert.ok((await state('kitchen')).kitchen.some(ticket=>ticket.orderId===pix.id));
    const persisted=(await db.query('SELECT expected_payment_method,cash_tendered_cents FROM delivery_details WHERE order_id=$1',[cash.id])).rows[0];
    assert.deepEqual(persisted,{expected_payment_method:'cash',cash_tendered_cents:10000});
    for(const [patch,message] of [[{cashTenderedCents:5000,expectedPaymentMethod:'cash'},'O valor para troco precisa'],[{cashTenderedCents:10000},'Troco só'],...[20001,2147483648,1e20].map(value=>[{deliveryFeeCents:value},'A taxa de entrega pode']),...[1000001,2147483648].map(value=>[{expectedPaymentMethod:'cash',cashTenderedCents:value},'O valor para troco pode'])]) {
      const key=randomUUID(); const response=await call('/api/operations/orders',{...delivery,...patch},'cashier',key);
      assert.equal(response.status,400);assert.ok(response.body.error.startsWith(message),response.body.error);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM orders WHERE restaurant_id=$1 AND request_key=$2',[rid,key])).rows[0].n,0);
    }
    const standard=await create({...delivery,deliveryFeeCents:undefined});assert.equal(standard.totalCents,6000+current.default_delivery_fee_cents);
    const dine=await create({tableNumber:number,items,sendToKitchen:true},'waiter');assert.equal(dine.totalCents,6000+Math.round(6000*current.service_rate_basis_points/10000));
    const pickup=await create({fulfillment:'pickup',customer:{name:prefix},items,sendToKitchen:true});assert.equal(pickup.totalCents,6000);
    const key=randomUUID(), first=await create(delivery,'cashier','/api/operations/orders',key), second=await create(delivery,'cashier','/api/operations/orders',key);assert.equal(first.id,second.id);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM kitchen_tickets WHERE order_id=$1',[first.id])).rows[0].n,1);
    for(const role of ['kitchen','waiter','cashier','delivery','manager']) {
      const body=await state(role);
      for(const order of body.orders.filter(order=>orders.includes(order.id))) {
        if(['kitchen','waiter'].includes(role)) for(const field of ['expectedPaymentMethod','cashTenderedCents','changeCents']) assert.equal(order[field],null);
        if(['kitchen','waiter','cashier'].includes(role)) assert.equal(order.delivery,null);
      }
      if(['cashier','delivery','manager'].includes(role)) assert.equal(body.orders.find(order=>order.id===cash.id).cashTenderedCents,10000);
      if(role==='kitchen') assert.ok(!JSON.stringify(body).includes('31999990000'));
    }
    const publicDelivery=await create({...delivery,source:'public_menu',deliveryFeeCents:0,expectedPaymentMethod:'cash',cashTenderedCents:999999},null,'/api/public/orders');
    assert.equal(publicDelivery.totalCents,6000+current.default_delivery_fee_cents);
    assert.deepEqual((await db.query('SELECT expected_payment_method,cash_tendered_cents FROM delivery_details WHERE order_id=$1',[publicDelivery.id])).rows[0],{expected_payment_method:null,cash_tendered_cents:null});
    await create({source:'qr_menu',fulfillment:'dine_in',tableNumber:number,items},null,'/api/public/orders');
    // Database constraints: each probe rolls back, including successful updates.
    async function probe(sql,params,constraint) {
      await db.query('BEGIN');
      try {
        await db.query('SAVEPOINT probe');
        try {const result=await db.query(sql,params);assert.equal(result.rowCount,1);assert.equal(constraint,null);}
        catch(error) {if(!constraint) throw error;assert.equal(error.code,'23514');assert.equal(error.constraint,constraint);}
        await db.query('ROLLBACK TO SAVEPOINT probe');
      } finally {await db.query('ROLLBACK');}
    }
    for(const [method,tendered,constraint] of [[null,10000,'delivery_details_tendered_only_cash'],['pix',10000,'delivery_details_tendered_only_cash'],['cash',10000,null],['boleto',null,'delivery_details_expected_payment_method_check'],['cash',-1,'delivery_details_cash_tendered_cents_check'],[null,null,null]]) {
      await probe('UPDATE delivery_details SET expected_payment_method=$2,cash_tendered_cents=$3 WHERE order_id=$1',[cash.id,method,tendered],constraint);
      assert.deepEqual((await db.query('SELECT expected_payment_method,cash_tendered_cents FROM delivery_details WHERE order_id=$1',[cash.id])).rows[0],persisted);
    }
    await probe('UPDATE restaurants SET default_delivery_fee_cents=-1 WHERE id=$1',[rid],'restaurants_default_delivery_fee_cents_check');
    const tickets=(await db.query('SELECT id FROM kitchen_tickets WHERE order_id=$1',[pix.id])).rows;
    for(const ticket of tickets) assert.equal((await call(`/api/internal/kitchen/${ticket.id}`,{status:'ready'},'kitchen',null,'PATCH')).status,200);
    assert.equal((await call(`/api/operations/deliveries/${pix.id}`,{status:'out_for_delivery'},'delivery',null,'PATCH')).status,200);
    assert.equal((await db.query('SELECT courier_name FROM delivery_details WHERE order_id=$1',[pix.id])).rows[0].courier_name,`${prefix}-delivery`);
    const beforeFee=(await db.query('SELECT default_delivery_fee_cents FROM restaurants WHERE id=$1',[rid])).rows[0].default_delivery_fee_cents;
    const settingsResponse=await call('/api/operations/settings',{name:'Configuração sintética',whatsapp:'',serviceRate:10,defaultDeliveryFeeCents:20001},'manager',null,'PATCH');
    assert.equal(settingsResponse.status,400);assert.ok(settingsResponse.body.error.includes('R$ 200,00'));
    assert.equal((await db.query('SELECT default_delivery_fee_cents FROM restaurants WHERE id=$1',[rid])).rows[0].default_delivery_fee_cents,beforeFee);
    const paymentPath=`/api/operations/orders/${cash.id}/payment`;
    for(const body of [{method:'Pix',receivedCents:10000},{method:'Dinheiro',receivedCents:5000},{method:'Dinheiro',receivedCents:1000001}]) {
      assert.equal((await call(paymentPath,body,'delivery')).status,400);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE order_id=$1',[cash.id])).rows[0].n,0);
    }
    const expectedCash=async()=>Number((await db.query("SELECT s.opening_cents+COALESCE((SELECT sum(l.debit_cents-l.credit_cents) FROM finance_lines l JOIN finance_entries e ON e.id=l.entry_id JOIN finance_accounts a ON a.id=l.account_id WHERE e.cash_shift_id=s.id AND a.code='cash' AND e.source_type<>'shift_open'),0) AS expected FROM cash_shifts s WHERE s.id=$1",[shift.id])).rows[0].expected);
    const beforeCash=await expectedCash();
    const paid=await call(paymentPath,{method:'Dinheiro',receivedCents:10000},'delivery');
    assert.equal(paid.status,200);assert.equal(paid.body.changeCents,3700);
    const payment=(await db.query('SELECT id,amount_cents,received_cents,change_cents,cash_shift_id FROM payments WHERE order_id=$1',[cash.id])).rows[0];
    assert.deepEqual([payment.amount_cents,payment.received_cents,payment.change_cents].map(Number),[6300,10000,3700]);
    assert.equal(payment.cash_shift_id,shift.id);assert.equal(await expectedCash()-beforeCash,6300);
    const alreadyPaid=await call(paymentPath,{method:'Dinheiro',receivedCents:10000},'delivery');
    assert.equal(alreadyPaid.status,400);assert.equal(alreadyPaid.body.error,'Este pedido já está pago.');
    const legacy=await create({...delivery,expectedPaymentMethod:'cash',cashTenderedCents:10000});
    assert.equal((await call(`/api/operations/orders/${legacy.id}/payment`,{method:'Dinheiro'},'delivery')).status,200);
    const legacyPayment=(await db.query('SELECT amount_cents,received_cents,change_cents FROM payments WHERE order_id=$1',[legacy.id])).rows[0];
    assert.deepEqual(Object.values(legacyPayment).map(Number),[6300,6300,0]);
    console.log('PASS GF-028d integração: 100/63/37 persistido, caixa líquido +6300, recusas sem pagamento, corpo antigo e já pago.');
    console.log('PASS channel-orders: T-DB-1..6; API channels, totals, cash, caps, idempotency, roles and public compatibility. courier lifecycle; T-API-16 settings cap.');
  } finally {
    // Also recover fixture orders after a response/transport failure, by exact product id.
    if(rid) {
      const found=(await db.query('SELECT DISTINCT order_id FROM order_items WHERE product_id=$1',[ids.product])).rows.map(row=>row.order_id);
      const all=[...new Set([...orders,...found])];
      if(all.length) {
        const entries=(await db.query('SELECT finance_entry_id FROM payments WHERE order_id=ANY($1::uuid[]) AND finance_entry_id IS NOT NULL',[all])).rows.map(row=>row.finance_entry_id);
        await db.query('DELETE FROM inventory_movements WHERE order_id=ANY($1::uuid[])',[all]);
        await db.query('DELETE FROM orders WHERE id=ANY($1::uuid[])',[all]);
        if(entries.length) await db.query('DELETE FROM finance_entries WHERE id=ANY($1::uuid[]) AND restaurant_id=$2',[entries,rid]);
      }
      await db.query('DELETE FROM menu_products WHERE id=$1',[ids.product]);
      await db.query('DELETE FROM dining_tables WHERE id=$1',[ids.table]);
      const staff=['waiter','cashier','kitchen','manager','delivery'];
      await db.query('DELETE FROM authentication_attempts WHERE restaurant_id=$1 AND identity_hash=ANY($2::text[])',[rid,staff.map(role=>createHash('sha256').update(`${prefix}-${role}`.toLowerCase()).digest('hex'))]);
      await db.query('DELETE FROM staff_members WHERE id=ANY($1::uuid[])',[staff.map(role=>ids[role])]);
    }
    await db.end();
  }
}
if(process.argv.includes('--unit')) await unit(); else await integration();
