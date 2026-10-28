// Authorized synthetic staff only; no production-code imports or credential output.
import { randomUUID, randomInt, randomBytes, scryptSync, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { guard, assertDatabaseTarget, assertCantina, EVIDENCE_ROOT } from './safety.mjs';

const base = guard('capture');
const out = path.join(EVIDENCE_ROOT, 'capturas-a4-2026-10-28', randomUUID());
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const report = { started: new Date().toISOString(), gitStart: { head: git(['rev-parse', '--short', 'HEAD']), status: git(['status', '--short']), diffHash: createHash('sha256').update(git(['diff'])).digest('hex') }, captures: [], checks: [], fixtureIds: [], cleanup: null, limitations: ['Admin cannot be synthetic staff: current staff role constraint excludes admin; management captured as manager.', 'Normal live baseline only. Empty/loading/error, aesthetic acceptance and physical touch remain separate checks.'] };
let db, browser, restaurantId;
const members = [];
const identities = [];
const check = (id, expected, actual, classification = 'produto') => report.checks.push({ id, expected, actual, passed: JSON.stringify(expected) === JSON.stringify(actual), classification });
try {
  // Operator explicitly authorized this loader; it reads configuration without exposing it.
  const { connect, connectionString } = await import('../../scripts/database.mjs');
  assertDatabaseTarget(connectionString());
  db = await connect();
  restaurantId = await assertCantina(db);
  const { chromium } = await import(pathToFileURL(process.env.QA_PLAYWRIGHT_MODULE).href);
  browser = await chromium.launch({ executablePath: process.env.QA_BROWSER_EXECUTABLE });
  await mkdir(out, { recursive: true });
  report.browser = browser.version();
  const constraints = await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='staff_members'::regclass AND conname='staff_members_role_check'");
  report.staffRoleConstraint = constraints.rows.map(row => row.definition);
  await db.query('BEGIN');
  try {
    for (const role of ['manager', 'waiter', 'kitchen', 'cashier', 'delivery']) {
      const member = { id: randomUUID(), name: `QA-${randomUUID().slice(0, 8)}-${role}`, role, pin: String(randomInt(100000, 1000000)) };
      const salt = randomBytes(16).toString('hex');
      members.push(member);
      identities.push(createHash('sha256').update(member.name.toLocaleLowerCase('pt-BR')).digest('hex'));
      report.fixtureIds.push({ id: member.id, role, name: member.name });
      await db.query('INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5,$6)', [member.id, restaurantId, member.name, role, salt, scryptSync(member.pin, salt, 64).toString('hex')]);
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2));
  await new Promise(resolve => setTimeout(resolve, 2500));
  if (process.env.QA_SIMULATE_FAILURE === '1') throw new Error('Intentional harness failure after fixture creation');
  const routes = { public: ['/', '/menu', '/menu/entrega', '/gestao'], manager: ['/operacao', '/gestao/dashboard', '/gestao/mesas'], waiter: ['/operacao/garcom'], kitchen: ['/operacao/cozinha'], cashier: ['/operacao/caixa'], delivery: ['/operacao/entregas'] };
  if (process.env.QA_CAPTURE_SUPPLEMENT === '1') {
    for (const role of Object.keys(routes)) routes[role] = role === 'manager' ? ['/operacao', '/gestao/mesas'] : [];
  }
  for (const member of [null, ...members]) {
      const role = member?.role || 'public';
      if (!routes[role].length) continue;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base) return route.abort();
        if (!['GET', 'HEAD'].includes(req.method()) && !(req.method() === 'POST' && url.pathname === '/api/auth/login')) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      if (member) {
        const login = await context.request.post(`${base}/api/auth/login`, { data: { username: member.name, password: member.pin }, headers: { origin: base } });
        const body = await login.json();
        check(`${role}-login`, { status: 200, role }, { status: login.status(), role: body.role });
        if (login.status() !== 200 || body.role !== role) throw new Error(`Synthetic login failed: ${role}`);
        const session = await context.request.get(`${base}/api/auth/session`);
        const sessionBody = await session.json();
        check(`${role}-session`, { status: 200, authenticated: true, role }, { status: session.status(), authenticated: sessionBody.authenticated, role: sessionBody.role });
      }
      const team = await context.request.get(`${base}/api/auth/team`);
      if (!member) check('A8-01-auth-team', 404, team.status());
      if (member) {
        const management = await context.request.get(`${base}/api/operations/team`);
        check(`${role}-team-permission`, role === 'manager' ? 200 : 403, management.status());
      }
      for (const [width, height] of [[360, 800], [390, 844], [430, 932], [1280, 800], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        for (const route of routes[role]) {
          const consoleEvents = [], network = [];
          const onConsole = msg => { if (['warning', 'error'].includes(msg.type())) consoleEvents.push({ type: msg.type(), text: msg.text().replace(/QA-[a-z0-9-]+/gi, '[fixture]').slice(0, 700) }); };
          const onError = error => consoleEvents.push({ type: 'pageerror', text: error.message.slice(0, 700) });
          const onResponse = res => { if (res.status() >= 400) network.push({ path: new URL(res.url()).pathname, status: res.status() }); };
          page.on('console', onConsole); page.on('pageerror', onError); page.on('response', onResponse);
          try {
            const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(300);
            const original = await page.evaluate(() => ({ accent: getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim(), onAccent: getComputedStyle(document.documentElement).getPropertyValue('--brand-on-accent').trim() }));
            for (const [brand, accent, onAccent] of [['padrao', original.accent, original.onAccent], ['vermelha', '#C0262D', '#ffffff'], ['amarela', '#F2C230', '#111111']]) {
              await page.evaluate(({ accent, onAccent }) => { const root = document.documentElement; root.style.setProperty('--brand-accent', accent, 'important'); root.style.setProperty('--brand-on-accent', onAccent, 'important'); }, { accent, onAccent });
              await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
              const metrics = await page.evaluate(() => {
                const rgb = color => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
                const lum = color => rgb(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
                const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round((Math.max(x, y) + .05) / (Math.min(x, y) + .05) * 100) / 100; };
                const samples = [...document.querySelectorAll('.primary-button,button[type="submit"],.category-chip.active')].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => { const s = getComputedStyle(el); return { element: el.tagName, className: el.className, color: s.color, background: s.backgroundColor, contrast: s.backgroundColor === 'rgba(0, 0, 0, 0)' ? null : ratio(s.color, s.backgroundColor) }; });
                return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth, accent: getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim(), onAccent: getComputedStyle(document.documentElement).getPropertyValue('--brand-on-accent').trim(), contrastSamples: samples, smallTargets: [...document.querySelectorAll('button,a,input')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44); }).length };
              });
              const file = `${role}-${route.replace(/[^a-z0-9]/gi, '_') || 'hub'}-${width}x${height}-${brand}.png`;
              await page.screenshot({ path: path.join(out, file), fullPage: true, animations: 'disabled', mask: [page.locator('input[autocomplete="username"],input[type="password"]')] });
              report.captures.push({ role, route, finalPath: new URL(page.url()).pathname, status: response.status(), brand, file, ...metrics, console: [...consoleEvents], network: [...network] });
            }
            console.log(`Captured ${role} ${route} ${width}`);
          } catch (error) { report.checks.push({ id: `capture-${role}-${route}-${width}`, passed: false, classification: 'harness-or-product-pending', error: error.message.slice(0, 300) }); }
          finally { page.off('console', onConsole); page.off('pageerror', onError); page.off('response', onResponse); }
          await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2));
        }
      }
    } finally { await context.close(); }
  }
} catch (error) {
  report.failure = { name: error.name, code: error.code || null, message: error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]').slice(0, 300) };
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch { report.browserCloseFailed = true; }
  if (db && restaurantId && members.length) {
    try {
      await db.query('BEGIN');
      const ids = members.map(m => m.id);
      const owned = await db.query('SELECT id,restaurant_id FROM staff_members WHERE id=ANY($1::uuid[]) FOR UPDATE', [ids]);
      if (owned.rows.some(row => row.restaurant_id !== restaurantId)) throw new Error('Cleanup ownership mismatch');
      const linked = await db.query('SELECT id FROM orders WHERE approved_by_staff_id=ANY($1::uuid[])', [ids]);
      if (linked.rowCount) throw new Error('Unexpected order dependency; cleanup refused');
      await db.query('DELETE FROM authentication_attempts WHERE restaurant_id=$1 AND identity_hash=ANY($2::text[])', [restaurantId, identities]);
      await db.query('DELETE FROM staff_members WHERE restaurant_id=$1 AND id=ANY($2::uuid[])', [restaurantId, ids]);
      await db.query('COMMIT');
      const remaining = await db.query('SELECT id FROM staff_members WHERE id=ANY($1::uuid[])', [ids]);
      const attempts = await db.query('SELECT identity_hash FROM authentication_attempts WHERE restaurant_id=$1 AND identity_hash=ANY($2::text[])', [restaurantId, identities]);
      report.cleanup = { staffRemaining: remaining.rowCount, attemptsRemaining: attempts.rowCount, exactIdsOnly: true };
    } catch (error) { await db.query('ROLLBACK'); report.cleanup = { failed: true, message: error.message.slice(0, 200) }; process.exitCode = 1; }
  }
  await db?.end();
  members.forEach(m => { delete m.pin; });
  report.gitEnd = { head: git(['rev-parse', '--short', 'HEAD']), status: git(['status', '--short']), diffHash: createHash('sha256').update(git(['diff'])).digest('hex') };
  report.finished = new Date().toISOString();
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, captures: report.captures.length, cleanup: report.cleanup, failure: report.failure, failedChecks: report.checks.filter(c => c.passed === false) }, null, 2));
}
