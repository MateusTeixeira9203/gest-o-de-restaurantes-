// Offline manifest only. This command never connects to a database.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { guard, EVIDENCE_ROOT, SLUG } from './safety.mjs';

guard('plan');
const runId = randomUUID();
const manifest = {
  version: 1, runId, slug: SLUG, state: 'planned-not-inserted',
  restaurantId: null,
  products: [{ id: randomUUID(), variantId: randomUUID(), name: `QA ${runId} prato`, priceCents: 6000 }],
  table: { id: randomUUID(), number: 199, label: `QA ${runId}` },
  staff: ['admin', 'manager', 'waiter', 'kitchen', 'cashier', 'delivery'].map(role => ({ id: randomUUID(), role, name: `QA ${runId} ${role}` })),
  customer: { name: `QA ${runId}`, phone: '00000000000', address: 'Rua Sintetica QA, 100', city: 'Cidade de Teste' },
  deliveryFeeCents: 300, cashTenderedCents: 10000,
  requests: ['mesa', 'balcao', 'entrega', 'troco-invalido', 'idempotencia', 'pagamento', 'abrir-caixa', 'fechar-caixa'].map(scenario => ({ scenario, key: randomUUID() })),
  // Append exact returned IDs immediately after each API success, before the next action.
  created: { orders: [], tickets: [], items: [], deliveryDetails: [], payments: [], events: [], financeLines: [], financeEntries: [], financeDocuments: [], financeSettlements: [], financeCommands: [], shifts: [], authenticationAttempts: [] },
};
const dir = path.join(EVIDENCE_ROOT, 'qa', runId);
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'fixture-manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
console.log(`Plan only, no rows created: ${path.join(dir, 'fixture-manifest.json')}`);
