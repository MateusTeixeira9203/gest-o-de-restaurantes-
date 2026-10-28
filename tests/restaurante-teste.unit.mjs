import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, scryptSync } from 'node:crypto';
import { main, run, SLUG, LOGIN_FILE, validateTarget } from '../scripts/restaurante-teste.mjs';

const url = 'postgresql://synthetic:synthetic@ep-square-dawn-b6qhiaxp.us-east-2.aws.neon.tech/test';
const roles = ['manager', 'waiter', 'kitchen', 'cashier', 'delivery'];
const tables = ['restaurants', 'restaurant_counters', 'inventory_settings', 'finance_accounts', 'staff_members', 'dining_tables', 'menu_products', 'menu_variants', 'inventory_items', 'inventory_movements', 'payment_intents', 'fiscal_documents', 'integration_operations', 'finance_settlements', 'finance_documents', 'purchase_lines', 'purchases', 'finance_series', 'orders', 'finance_lines', 'finance_entries', 'cash_shifts', 'finance_commands'];

// A pg-shaped client, with in-memory rows and transactional rollback. No pg import or network.
class FakeClient {
  constructor() {
    this.rows = Object.fromEntries(tables.map(table => [table, []]));
    this.calls = [];
  }
  async connect() { this.connected = true; }
  async end() { this.ended = true; }
  async query(sql, params = []) {
    this.calls.push({ sql, params });
    if (sql === 'BEGIN') this.snapshot = structuredClone(this.rows);
    else if (sql === 'ROLLBACK') this.rows = this.snapshot;
    else if (sql === 'COMMIT') {
      if (this.failCommit) throw new Error('synthetic sensitive failure');
    } else if (sql.startsWith('SELECT pg_advisory')) { /* transaction lock */ }
    else if (sql.startsWith('SELECT id FROM restaurants')) return { rows: this.rows.restaurants.filter(row => row.slug === params[0]) };
    else if (sql.startsWith('SELECT name,role')) return { rows: this.rows.staff_members.filter(row => row.restaurant_id === params[0]) };
    else if (sql.startsWith('INSERT INTO')) {
      const [, table, columns, values] = sql.match(/^INSERT INTO (\w+)\(([^)]+)\) VALUES\((.*)\)$/);
      const row = { id: randomUUID() };
      const tokens = values.split(',');
      columns.split(',').forEach((column, index) => {
        const token = tokens[index];
        row[column] = token.startsWith('$') ? params[Number(token.slice(1)) - 1] : token.replace(/^'|'$/g, '');
      });
      if (table === 'restaurants') {
        assert.ok(!this.rows.restaurants.some(other => other.slug === row.slug), 'unique restaurant slug');
        row.accent_color = '#059669';
      }
      if (table === 'staff_members') assert.ok(roles.includes(row.role), 'schema accepts only five roles');
      this.rows[table].push(row);
    } else if (sql.startsWith('SELECT t.')) {
      const [, key, table] = sql.match(/^SELECT t\.(\w+) AS id FROM (\w+)/);
      const restaurant = this.rows.restaurants.find(row => row.id === params[0] && row.slug === params[1]);
      return { rows: restaurant ? this.rows[table].filter(row => row.restaurant_id === restaurant.id).map(row => ({ id: row[key] })) : [] };
    } else if (sql.startsWith('DELETE FROM restaurants')) {
      assert.equal(sql, 'DELETE FROM restaurants WHERE id=$1 AND slug=$2');
      this.rows.restaurants = this.rows.restaurants.filter(row => row.id !== params[0] || row.slug !== params[1]);
    } else if (sql.startsWith('DELETE FROM')) {
      const [, table, key] = sql.match(/^DELETE FROM (\w+) WHERE (\w+)=ANY/);
      assert.ok(sql.includes('restaurant_id=$2') && sql.includes('r.slug=$3'), 'delete checks tenant and slug');
      const restaurant = this.rows.restaurants.find(row => row.id === params[1] && row.slug === params[2]);
      if (restaurant) this.rows[table] = this.rows[table].filter(row => !(row.restaurant_id === restaurant.id && params[0].includes(row[key])));
    } else throw new Error('Unexpected SQL in simulated client');
    return { rows: [] };
  }
}

function memoryFile() {
  let content;
  return {
    writes: 0,
    exists: () => content !== undefined,
    write(value) { if (content !== undefined) throw new Error('exists'); content = value; this.writes++; },
    remove() { content = undefined; },
    // Only used inside assertions; never printed, returned by a test or written to disk.
    checkStaff(staff) {
      const pins = content.split('\n').slice(1).filter(Boolean).map(line => line.split(': ')[1]);
      return pins.length === 5 && new Set(pins).size === 5 && pins.every((pin, index) => /^\d{6}$/.test(pin) && scryptSync(pin, staff[index].pin_salt, 64).toString('hex') === staff[index].pin_hash);
    },
    containsSecret(output) { return content.split('\n').slice(1).filter(Boolean).some(line => output.includes(line.split(': ')[1])); },
  };
}

test('destino, modo e slug incorretos recusados antes de conectar; URL não vaza', async () => {
  for (const host of ['localhost', 'ep-other.neon.tech', 'ep-square-dawn-b6qhiaxp.evil.test', 'ep-square-dawn-b6qhiaxp.us.aws.neon.tech.evil.test']) {
    let constructed = false;
    const output = [];
    const code = await main({ args: ['criar'], databaseUrl: `postgresql://synthetic:secret@${host}/test`, Client: class { constructor() { constructed = true; } }, output: { log: text => output.push(text), error: text => output.push(text) } });
    assert.equal(code, 1);
    assert.equal(constructed, false);
    assert.ok(!output.join('').includes('secret') && !output.join('').includes(host));
  }
  assert.throws(() => validateTarget(url, 'limpar', 'outro-sintetico'));
  assert.throws(() => validateTarget(url, 'outro', SLUG));
  assert.throws(() => validateTarget('invalid', 'criar', SLUG));
  validateTarget(url.replace('b6qhiaxp.', 'b6qhiaxp-pooler.'), 'criar', SLUG);
});

test('criação sintética completa, cinco PINs com hash, sem admin/domínio; segunda execução não altera estado nem PINs', async () => {
  const db = new FakeClient(), file = memoryFile(), output = [];
  const options = { args: ['criar'], databaseUrl: url, Client: class { constructor() { return db; } }, file, output: { log: text => output.push(text), error: text => output.push(text) } };
  assert.equal(await main(options), 0);
  assert.equal(db.rows.restaurants.length, 1);
  const restaurant = db.rows.restaurants[0];
  assert.equal(restaurant.slug, SLUG);
  assert.equal(restaurant.name, 'Cantina Modelo');
  assert.equal(restaurant.plan, 'professional');
  assert.equal(restaurant.product_status, 'pilot');
  assert.ok(!db.calls.find(call => /INSERT INTO restaurants/.test(call.sql)).sql.includes('accent_color'));
  assert.equal(db.rows.dining_tables.length, 15);
  assert.deepEqual(db.rows.dining_tables.map(row => row.number), Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(db.rows.dining_tables.map(row => row.label), Array.from({ length: 15 }, (_, i) => `Mesa ${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(db.rows.staff_members.map(row => row.role), roles);
  assert.ok(file.checkStaff(db.rows.staff_members), 'PINs randomizados e hashes compatíveis');
  assert.ok(!file.containsSecret(output.join('\n')), 'saída não contém PIN');
  assert.equal(db.rows.menu_products.length, 2);
  assert.equal(db.rows.menu_variants.length, 2);
  assert.equal(db.rows.inventory_items.length, 2);
  assert.ok(db.rows.inventory_items.every(row => row.cost_known === 'true' && row.average_cost_cents === '500'));
  assert.equal(db.rows.restaurant_counters.length, 1);
  assert.equal(db.rows.inventory_settings.length, 1);
  assert.equal(db.rows.finance_accounts.length, 16);
  assert.ok(db.rows.finance_accounts.every(row => row.name !== row.code));
  assert.equal(db.rows.finance_accounts.find(row => row.code === 'cash').name, 'Dinheiro no caixa');
  assert.equal(db.rows.finance_accounts.find(row => row.code === 'service_payable').name, 'Taxa de serviço a repassar');
  assert.ok(output.some(text => text.includes('RESTAURANT_SLUG=cantina-modelo')));
  assert.ok(output.some(text => text.includes('CASCADE')));
  assert.ok(!db.calls.some(call => call.sql.includes('restaurant_domains')));
  assert.equal(LOGIN_FILE, 'C:\\Users\\mateu\\Desktop\\Evidencias\\Restrio\\logins-cantina-modelo.txt');
  const before = structuredClone(db.rows);
  const inserts = db.calls.filter(call => call.sql.startsWith('INSERT')).length;
  assert.equal(await main(options), 0);
  assert.deepEqual(db.rows, before);
  assert.equal(db.calls.filter(call => call.sql.startsWith('INSERT')).length, inserts);
  assert.equal(file.writes, 1);
  assert.ok(db.ended);
});

test('query não pode sobrescrever destino do pg; somente três parâmetros permitidos', async () => {
  for (const query of ['host=outro.example', 'hostaddr=', 'port=5433', 'dbname=outro', 'service=outro', 'options=outro', 'application_name=outro', '%68ost=outro.example', 'sslmode=require&host=outro.example']) {
    let constructed = false;
    const messages = [];
    assert.equal(await main({ args: ['criar'], databaseUrl: `${url}?${query}`, Client: class { constructor() { constructed = true; } }, output: { log: text => messages.push(text), error: text => messages.push(text) } }), 1);
    assert.equal(constructed, false);
    assert.ok(!messages.join('').includes('outro.example'));
  }
  validateTarget(`${url}?sslmode=require`, 'criar', SLUG);
  validateTarget(`${url}?sslmode=require&channel_binding=require&connect_timeout=10`, 'criar', SLUG);
});

test('escrita parcial de logins é removida e banco sofre rollback', async () => {
  const db = new FakeClient(), file = memoryFile();
  const write = file.write.bind(file);
  file.write = value => { write(value); throw new Error('partial write'); };
  await assert.rejects(run({ databaseUrl: url, mode: 'criar', db, file }));
  assert.equal(file.exists(), false);
  assert.equal(db.rows.restaurants.length, 0);
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
});

test('estado inconsistente recusa sem substituir PINs; falha de arquivo ou COMMIT faz rollback', async () => {
  const db = new FakeClient(), file = memoryFile();
  await run({ databaseUrl: url, mode: 'criar', db, file });
  file.remove();
  const before = structuredClone(db.rows);
  await assert.rejects(run({ databaseUrl: url, mode: 'criar', db, file }));
  assert.deepEqual(db.rows, before);
  assert.equal(file.writes, 1);
  const orphanFile = memoryFile();
  orphanFile.write('synthetic orphan');
  const orphanDb = new FakeClient();
  await assert.rejects(run({ databaseUrl: url, mode: 'criar', db: orphanDb, file: orphanFile }));
  assert.equal(orphanDb.rows.restaurants.length, 0);
  assert.equal(orphanFile.writes, 1);
  for (const failFile of [false, true]) {
    const empty = new FakeClient(), memory = memoryFile();
    empty.failCommit = !failFile;
    if (failFile) memory.write = () => { throw new Error('file unavailable'); };
    await assert.rejects(run({ databaseUrl: url, mode: 'criar', db: empty, file: memory }));
    assert.equal(empty.rows.restaurants.length, 0);
    assert.equal(memory.exists(), false);
    assert.equal(empty.calls.at(-1).sql, 'ROLLBACK');
  }
});

test('falha na limpeza reverte exclusões e preserva o arquivo de logins', async () => {
  const db = new FakeClient(), file = memoryFile();
  await run({ databaseUrl: url, mode: 'criar', db, file });
  const before = structuredClone(db.rows);
  db.failCommit = true;
  await assert.rejects(run({ databaseUrl: url, mode: 'limpar', db, file }));
  assert.deepEqual(db.rows, before);
  assert.ok(file.exists());
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
});

test('limpeza usa IDs exatos e slug, respeita dependências e preserva outro restaurante; repetir é seguro', async () => {
  const db = new FakeClient(), file = memoryFile();
  const target = randomUUID(), other = randomUUID();
  db.rows.restaurants.push({ id: target, slug: SLUG }, { id: other, slug: 'outro-sintetico' });
  for (const table of tables.filter(table => table !== 'restaurants')) {
    for (const restaurant_id of [target, other]) db.rows[table].push({ id: randomUUID(), request_key: randomUUID(), operation_id: randomUUID(), restaurant_id });
  }
  const otherBefore = tables.flatMap(table => db.rows[table].filter(row => row.restaurant_id === other || row.id === other));
  await run({ databaseUrl: url, mode: 'limpar', db, file });
  const deletes = db.calls.filter(call => call.sql.startsWith('DELETE'));
  for (const call of deletes) {
    assert.ok(call.sql.includes('WHERE') && call.sql.includes('slug'));
    assert.ok(call.params.includes(SLUG) && call.params.includes(target));
    assert.ok(!call.params.includes(other));
    if (!call.sql.startsWith('DELETE FROM restaurants')) {
      const table = call.sql.split(' ')[2];
      const selected = db.snapshot[table].filter(row => row.restaurant_id === target);
      assert.ok(call.params[0].every(id => selected.some(row => [row.id, row.request_key, row.operation_id].includes(id))));
    }
  }
  const index = table => deletes.findIndex(call => call.sql.startsWith(`DELETE FROM ${table} WHERE`));
  for (const [child, parent] of [['finance_settlements', 'finance_documents'], ['finance_documents', 'finance_entries'], ['orders', 'finance_entries'], ['finance_lines', 'finance_entries'], ['finance_lines', 'finance_accounts'], ['finance_entries', 'cash_shifts'], ['payment_intents', 'cash_shifts'], ['inventory_movements', 'purchase_lines'], ['purchase_lines', 'purchases'], ['purchases', 'finance_series'], ['inventory_movements', 'inventory_items'], ['menu_products', 'inventory_items'], ['fiscal_documents', 'integration_operations'], ['finance_accounts', 'restaurants'], ['finance_commands', 'restaurants']]) assert.ok(index(child) >= 0 && index(child) < index(parent), `${child} precede ${parent}`);
  assert.deepEqual(tables.flatMap(table => db.rows[table].filter(row => row.restaurant_id === other || row.id === other)), otherBefore);
  assert.equal(db.calls.at(-1).sql, 'COMMIT');
  const count = deletes.length;
  await run({ databaseUrl: url, mode: 'limpar', db, file });
  assert.equal(db.calls.filter(call => call.sql.startsWith('DELETE')).length, count);
});

test('erros de pg são sanitizados e cliente é fechado', async () => {
  let ended = false;
  const messages = [];
  class BrokenClient {
    async connect() { throw new Error('postgresql://synthetic:DO_NOT_PRINT@host/test'); }
    async end() { ended = true; }
  }
  assert.equal(await main({ args: ['criar'], databaseUrl: url, Client: BrokenClient, output: { log: text => messages.push(text), error: text => messages.push(text) } }), 1);
  assert.ok(ended);
  assert.ok(!messages.join('').includes('DO_NOT_PRINT'));
});
