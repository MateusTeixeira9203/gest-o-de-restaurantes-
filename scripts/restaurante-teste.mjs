// O usuário define RESTAURANT_SLUG=cantina-modelo no próprio .env.local.
// limpar também apaga por CASCADE qualquer domínio ligado à Cantina Modelo.
import { randomBytes, randomInt, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SLUG = 'cantina-modelo';
export const LOGIN_FILE = 'C:\\Users\\mateu\\Desktop\\Evidencias\\Restrio\\logins-cantina-modelo.txt';
const roles = ['manager', 'waiter', 'kitchen', 'cashier', 'delivery'];
// Nomes de drizzle/0007_financial_core.sql:16-20 e 0012_service_charge_liability.sql:2.
const accounts = [
  ['cash', 'Dinheiro no caixa', 'cash'], ['bank', 'Banco / Pix', 'bank'],
  ['cards', 'Cartões a receber', 'clearing'], ['receivable', 'Vendas a receber', 'asset'],
  ['advances', 'Adiantamentos de clientes', 'liability'], ['sales', 'Vendas realizadas', 'income'],
  ['payable', 'Fornecedores a pagar', 'liability'], ['other_receivable', 'Outras contas a receber', 'asset'],
  ['other_income', 'Outras receitas', 'income'], ['operating', 'Despesas operacionais', 'expense'],
  ['tax', 'Tributos', 'expense'], ['fees', 'Taxas de pagamento', 'expense'],
  ['stock', 'Compras de estoque', 'asset'], ['capital', 'Investimentos', 'asset'],
  ['equity', 'Saldo inicial / aporte', 'equity'], ['service_payable', 'Taxa de serviço a repassar', 'liability'],
];

export function validateTarget(databaseUrl, mode, slug) {
  if (slug !== SLUG || !['criar', 'limpar'].includes(mode)) throw new Error('Modo ou slug recusado.');
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL inválida.'); }
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'channel_binding', 'connect_timeout'].includes(key)) throw new Error('Parâmetro de DATABASE_URL recusado.');
  }
  const endpoint = 'ep-square-dawn-b6qhiaxp';
  const host = url.hostname;
  const allowed = host === endpoint || new RegExp(`^${endpoint}(-pooler)?\\.[a-z0-9.-]+\\.neon\\.tech$`).test(host);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !allowed) throw new Error('Host de DATABASE_URL recusado.');
}

// The real filesystem is used only by the CLI; unit tests supply an in-memory adapter.
const loginFile = {
  exists: () => existsSync(LOGIN_FILE),
  write: (content) => {
    mkdirSync(dirname(LOGIN_FILE), { recursive: true });
    writeFileSync(LOGIN_FILE, content, { flag: 'wx', mode: 0o600 });
  },
  remove: () => { if (existsSync(LOGIN_FILE)) unlinkSync(LOGIN_FILE); },
};

// These children precede their referenced parents, including the non-cascading finance FKs.
const cleanup = [
  ['inventory_movements', 'id'], ['payment_intents', 'operation_id'],
  ['fiscal_documents', 'id'], ['integration_operations', 'id'],
  ['finance_settlements', 'id'], ['finance_documents', 'id'],
  ['purchase_lines', 'id'], ['purchases', 'id'], ['finance_series', 'id'],
  ['orders', 'id'], ['finance_lines', 'id'], ['finance_entries', 'id'],
  ['cash_shifts', 'id'], ['finance_commands', 'request_key'], ['finance_accounts', 'id'],
  ['menu_products', 'id'], ['inventory_items', 'id'],
];

export async function run({ databaseUrl, mode, slug = SLUG, db, file = loginFile }) {
  validateTarget(databaseUrl, mode, slug);
  await db.query('BEGIN');
  let wroteFile = false;
  try {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SLUG]);
    const restaurant = (await db.query('SELECT id FROM restaurants WHERE slug=$1 FOR UPDATE', [SLUG])).rows[0];
    if (mode === 'limpar') {
      if (restaurant) {
        const id = restaurant.id;
        for (const [table, key] of cleanup) {
          const ids = (await db.query(`SELECT t.${key} AS id FROM ${table} t JOIN restaurants r ON r.id=t.restaurant_id WHERE r.id=$1 AND r.slug=$2`, [id, SLUG])).rows.map(row => row.id);
          if (ids.length) await db.query(`DELETE FROM ${table} WHERE ${key}=ANY($1::uuid[]) AND restaurant_id=$2 AND EXISTS (SELECT 1 FROM restaurants r WHERE r.id=$2 AND r.slug=$3)`, [ids, id, SLUG]);
        }
        await db.query('DELETE FROM restaurants WHERE id=$1 AND slug=$2', [id, SLUG]);
      }
    } else if (restaurant) {
      const staff = (await db.query('SELECT name,role FROM staff_members WHERE restaurant_id=$1', [restaurant.id])).rows;
      if (!file.exists() || staff.length !== roles.length || !roles.every(role => staff.some(member => member.role === role && member.name === `Modelo ${role}`))) {
        throw new Error('Equipe ou arquivo de logins inconsistente; intervenção necessária.');
      }
    } else {
      if (file.exists()) throw new Error('Arquivo de logins já existe sem restaurante; intervenção necessária.');
      const id = randomUUID();
      await db.query("INSERT INTO restaurants(id,slug,name,plan,product_status) VALUES($1,$2,'Cantina Modelo','professional','pilot')", [id, SLUG]);
      await db.query('INSERT INTO restaurant_counters(restaurant_id) VALUES($1)', [id]);
      await db.query('INSERT INTO inventory_settings(restaurant_id) VALUES($1)', [id]);
      for (const [code, name, kind] of accounts) await db.query('INSERT INTO finance_accounts(restaurant_id,code,name,kind) VALUES($1,$2,$3,$4)', [id, code, name, kind]);
      const logins = ['Cantina Modelo — equipe sintética (admin usa o mecanismo existente)'];
      const pins = new Set();
      for (const role of roles) {
        let pin;
        do { pin = String(randomInt(100000, 1000000)); } while (pins.has(pin));
        pins.add(pin);
        const salt = randomBytes(16).toString('hex');
        await db.query('INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), id, `Modelo ${role}`, role, salt, scryptSync(pin, salt, 64).toString('hex')]);
        logins.push(`Modelo ${role}: ${pin}`);
      }
      for (let number = 1; number <= 15; number++) await db.query('INSERT INTO dining_tables(id,restaurant_id,number,label) VALUES($1,$2,$3,$4)', [randomUUID(), id, number, `Mesa ${String(number).padStart(2, '0')}`]);
      for (const [name, category, price] of [['Prato da Cantina', 'Cozinha', 2200], ['Suco Modelo', 'Bebidas', 700]]) {
        const product = randomUUID();
        await db.query('INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,$4,$4)', [product, id, name, category]);
        await db.query("INSERT INTO menu_variants(id,product_id,name,price_cents) VALUES($1,$2,'Individual',$3)", [randomUUID(), product, price]);
      }
      for (const [name, unit, quantity] of [['Arroz Modelo', 'kg', 10], ['Polpa Modelo', 'un', 20]]) await db.query('INSERT INTO inventory_items(id,restaurant_id,name,unit,quantity,minimum_quantity,average_cost_cents,cost_known) VALUES($1,$2,$3,$4,$5,2,500,true)', [randomUUID(), id, name, unit, quantity]);
      wroteFile = true;
      file.write(logins.join('\n') + '\n');
    }
    await db.query('COMMIT');
  } catch (error) {
    try { await db.query('ROLLBACK'); } finally { if (wroteFile) file.remove(); }
    throw error;
  }
  if (mode === 'limpar') file.remove();
}

export async function main({ args = process.argv.slice(2), databaseUrl = process.env.DATABASE_URL, Client, file = loginFile, output = console } = {}) {
  let db;
  try {
    if (args.length < 1 || args.length > 2) throw new Error('Use criar ou limpar.');
    const [mode, slug = SLUG] = args;
    validateTarget(databaseUrl, mode, slug);
    const PgClient = Client ?? (await import('pg')).default.Client;
    db = new PgClient({ connectionString: databaseUrl });
    await db.connect();
    await run({ databaseUrl, mode, slug, db, file });
    output.log('Operação da Cantina Modelo concluída.');
    output.log('O usuário define RESTAURANT_SLUG=cantina-modelo no próprio .env.local. limpar apaga por CASCADE qualquer domínio ligado à Cantina Modelo.');
    return 0;
  } catch {
    // pg and filesystem errors may contain credentials: never print the original error.
    output.error('Operação recusada ou falhou; verifique modo, destino e consistência da equipe/arquivo.');
    return 1;
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
