import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { orderCode } from '../lib/domain.ts';

// Replace server dependencies before importing the real repository and route.
// No database module, pg client, Next server or environment file is loaded.
const mockUrl = 'data:text/javascript,' + encodeURIComponent(`
  let handlers = {};
  export const configure = value => { handlers = value; };
  const call = (name, args) => {
    if (!handlers[name]) throw new Error('Unexpected simulated dependency: ' + name);
    return handlers[name](...args);
  };
  export const query = (...args) => call('query', args);
  export const transaction = callback => callback({ query });
  export const restaurantContext = () => ({ id: 'tenant-synthetic' });
  export const recognizeSale = (...args) => call('recognizeSale', args);
  export const getOperationSnapshot = () => call('snapshot', []);
  export const sessionFromRequest = () => ({ role: 'kitchen', username: 'Kitchen Synthetic' });
  export const accountVersion = () => { throw new Error('Unused dependency'); };
  export const snapshotRecipeCost = accountVersion;
  export const assertOrderApprover = accountVersion;
  export const requestHash = accountVersion;
  export const postSalePayment = accountVersion;
`);
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return { url: mockUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { configure } = await import(mockUrl);
const { getKitchenQueue, updateDeliveryStatus } = await import('../lib/restaurant-repository.ts');
const { GET } = await import('../app/api/operations/state/route.ts');
hook.deregister();

test('orderCode identifica entrega, balcão e mesa, preenchendo NN sem truncar mesas maiores', () => {
  assert.equal(orderCode({ fulfillment: 'delivery', orderNumber: 42, tableNumber: null }), 'E-42');
  assert.equal(orderCode({ fulfillment: 'pickup', orderNumber: 43, tableNumber: null }), 'B-43');
  assert.equal(orderCode({ fulfillment: 'dine_in', orderNumber: 44, tableNumber: 3 }), 'Mesa 03 · #44');
  assert.equal(orderCode({ fulfillment: 'dine_in', orderNumber: 45, tableNumber: 123 }), 'Mesa 123 · #45');
});

test('mesa sem número usa marcador desconhecido', () => {
  assert.equal(orderCode({fulfillment:'dine_in',orderNumber:46,tableNumber:null}), 'Mesa ? · #46');
});

test('fila inclui confirmedAt e projeta somente o contrato da cozinha, sem endereço/telefone', async () => {
  const confirmed = '2026-10-28T12:01:00.000Z';
  configure({ query: async (sql, params) => {
    assert.ok(sql.includes('o.confirmed_at'));
    assert.ok(!/customer_phone|delivery_details|address_line/i.test(sql));
    assert.deepEqual(params, ['tenant-synthetic', 'Cozinha']);
    return { rows: [{
      ticket_id: 'ticket-synthetic', order_id: 'order-synthetic', order_number: '42', queue_number: '9',
      kitchen_sector: 'Cozinha', ticket_status: 'new', fulfillment: 'delivery', table_number: null,
      customer_name: 'Pessoa Sintética', estimated_minutes: 20, created_at: '2026-10-28T12:00:00.000Z',
      confirmed_at: confirmed, notes: null, items: [],
      customer_phone: 'PHONE_SYNTHETIC_DO_NOT_EXPOSE', address_line1: 'ADDRESS_SYNTHETIC_DO_NOT_EXPOSE',
    }] };
  } });
  const kitchen = await getKitchenQueue('Cozinha');
  assert.deepEqual(Object.keys(kitchen[0]).sort(), ['id', 'orderId', 'orderNumber', 'queueNumber', 'sector', 'status', 'fulfillment', 'tableNumber', 'customerName', 'estimatedMinutes', 'createdAt', 'confirmedAt', 'notes', 'items'].sort());
  assert.equal(kitchen[0].confirmedAt, confirmed);
  assert.equal(kitchen[0].orderNumber, 42);
  assert.equal(kitchen[0].queueNumber, 9);

  configure({ snapshot: async () => ({
    restaurant: { name: 'Restaurante Sintético' }, products: [], tables: [{ number: 1 }],
    orders: [
      { id: 'order-synthetic', status: 'confirmed', delivery: { addressLine1: 'ADDRESS_SYNTHETIC_DO_NOT_EXPOSE' }, customerPhone: 'PHONE_SYNTHETIC_DO_NOT_EXPOSE', payments: [{ method: 'cash', amountCents: 1000 }], paidCents: 1000 },
      { id: 'order-pending', status: 'pending', delivery: null, customerPhone: null, payments: [], paidCents: 0 },
    ],
    kitchen: [...kitchen, { orderId: 'order-pending' }],
    inventory: { enabled: true, items: [{ name: 'Estoque sintético' }] },
  }) });
  const response = await GET(new Request('http://localhost/api/operations/state'));
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes('ADDRESS_SYNTHETIC_DO_NOT_EXPOSE'));
  assert.ok(!text.includes('PHONE_SYNTHETIC_DO_NOT_EXPOSE'));
  const json = JSON.parse(text);
  assert.deepEqual(json.kitchen, kitchen);
  assert.equal(json.kitchen[0].confirmedAt, confirmed);
  assert.equal(json.orders.length, 1);
  assert.equal(json.orders[0].delivery, null);
  assert.equal(json.orders[0].customerPhone, null);
  assert.deepEqual(json.orders[0].payments, []);
  assert.equal(json.orders[0].paidCents, 0);
  assert.deepEqual(json.tables, []);
  assert.deepEqual(json.inventory, { enabled: false, items: [], movements: [], recipes: [] });
});

test('confirmedAt nulo é preservado para registros antigos', async () => {
  configure({ query: async () => ({ rows: [{ confirmed_at: null }] }) });
  assert.equal((await getKitchenQueue())[0].confirmedAt, null);
});

test('saída grava o usuário da sessão; conclusão preserva entregador e transições existentes', async () => {
  let status = 'ready', courier = null, sales = 0;
  const calls = [];
  configure({
    recognizeSale: async () => { sales++; },
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT o.id, o.status')) {
        assert.deepEqual(params, ['order-synthetic', 'tenant-synthetic']);
        return { rows: [{ id: 'order-synthetic', status }] };
      }
      if (sql.startsWith('SELECT COALESCE')) return { rows: [{ paid: true }] };
      if (sql.startsWith('UPDATE orders')) status = params[1];
      else if (sql.startsWith('UPDATE delivery_details')) {
        assert.ok(sql.includes("courier_name = CASE WHEN $2 = 'out_for_delivery' THEN $3 ELSE courier_name END"));
        assert.ok(sql.endsWith('WHERE order_id = $1'));
        if (params[1] === 'out_for_delivery') courier = params[2];
      } else if (!sql.startsWith('INSERT INTO order_events')) throw new Error('Unexpected SQL');
      return { rows: [] };
    },
  });
  assert.deepEqual(await updateDeliveryStatus('order-synthetic', 'out_for_delivery', { role: 'delivery', name: 'Entregador Sintético' }), { id: 'order-synthetic', status: 'out_for_delivery' });
  assert.equal(courier, 'Entregador Sintético');
  assert.equal(sales, 0);
  await updateDeliveryStatus('order-synthetic', 'delivered', { role: 'manager', name: 'Gerente Sintético' });
  assert.equal(courier, 'Entregador Sintético');
  assert.equal(status, 'completed');
  assert.equal(sales, 1);
  assert.deepEqual(calls.filter(call => call.sql.startsWith('UPDATE delivery_details')).map(call => call.params), [
    ['order-synthetic', 'out_for_delivery', 'Entregador Sintético'],
    ['order-synthetic', 'delivered', 'Gerente Sintético'],
  ]);
  const before = calls.filter(call => call.sql.startsWith('UPDATE')).length;
  await assert.rejects(updateDeliveryStatus('order-synthetic', 'out_for_delivery', { role: 'delivery', name: 'Outro Sintético' }), /precisa estar pronta/);
  assert.equal(calls.filter(call => call.sql.startsWith('UPDATE')).length, before);
});
