// Offline only: no browser, database, filesystem writes or application imports.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guard, assertDatabaseTarget, assertCantina } from './safety.mjs';

test('QA refuses missing opt-in, wrong slug, wrong host and remote origins', () => {
  delete process.env.RESTRIO_QA_RUN;
  assert.throws(() => guard('capture'));
  Object.assign(process.env, { RESTRIO_QA_RUN: 'capture', QA_RESTAURANT_SLUG: 'cantina-modelo', QA_DB_HOST: 'ep-square-dawn-b6qhiaxp', QA_BASE_URL: 'http://localhost:3001' });
  assert.equal(guard('capture'), 'http://localhost:3001');
  assert.throws(() => guard('plan'));
  process.env.QA_RESTAURANT_SLUG = 'outro';
  assert.throws(() => guard('capture'));
  process.env.QA_RESTAURANT_SLUG = 'cantina-modelo';
  process.env.QA_DB_HOST = 'outro';
  assert.throws(() => guard('capture'));
  process.env.QA_DB_HOST = 'ep-square-dawn-b6qhiaxp';
  for (const base of ['https://example.com', 'http://localhost:3001/path', 'http://user@localhost:3001', 'file:///tmp']) {
    process.env.QA_BASE_URL = base;
    assert.throws(() => guard('capture'));
  }
});

test('database URL guard accepts only exact endpoint (direct or pooler)', () => {
  for (const endpoint of ['ep-square-dawn-b6qhiaxp', 'ep-square-dawn-b6qhiaxp-pooler']) {
    assertDatabaseTarget(`postgresql://${endpoint}.us-east-2.aws.neon.tech/test`);
  }
  for (const url of ['postgresql://ep-square-dawn-b6qhiaxp.attacker.example/test', 'postgresql://other.aws.neon.tech/test', 'https://ep-square-dawn-b6qhiaxp.us-east-2.aws.neon.tech/test']) {
    assert.throws(() => assertDatabaseTarget(url));
  }
});

test('Cantina check uses parameterized exact slug and rejects missing/ambiguous tenant', async () => {
  const fake = { query: async (sql, values) => {
    assert.equal(sql, 'SELECT id FROM restaurants WHERE slug=$1');
    assert.deepEqual(values, ['cantina-modelo']);
    return { rows: [{ id: 'synthetic-id' }] };
  } };
  assert.equal(await assertCantina(fake), 'synthetic-id');
  await assert.rejects(() => assertCantina({ query: async () => ({ rows: [] }) }));
  await assert.rejects(() => assertCantina({ query: async () => ({ rows: [{}, {}] }) }));
});
