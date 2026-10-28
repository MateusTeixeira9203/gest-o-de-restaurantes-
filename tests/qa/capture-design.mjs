import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { guard, EVIDENCE_ROOT } from './safety.mjs';

const base = guard('capture');
const stage = process.env.QA_STAGE;
if (!['antes', 'depois'].includes(stage)) throw new Error('QA_STAGE must be antes or depois');
const item = process.env.QA_ITEM || 'etapa-a';
if (!/^[a-zA-Z0-9-]+$/.test(item)) throw new Error('Invalid QA_ITEM');
const states = ['dados', 'carregando', 'vazio', 'erro'];
const state = process.env.QA_SCREEN_STATE || 'dados';
if (!states.includes(state)) throw new Error('Invalid QA_SCREEN_STATE');
if (state !== 'dados' && !process.env.QA_STATE_RESPONSES) throw new Error('Provide reviewed API response mocks for this state');
const mocks = JSON.parse(process.env.QA_STATE_RESPONSES || '{}');
if (!mocks || Array.isArray(mocks) || typeof mocks !== 'object' || (state !== 'dados' && !Object.keys(mocks).length)) throw new Error('Non-default states require at least one reviewed GET mock');
for (const [route, response] of Object.entries(mocks)) {
  if (!route.startsWith('/api/') || route.startsWith('/api/auth/') || route.includes('?') || !Number.isInteger(response.status) || response.status < 200 || response.status > 599) throw new Error('Invalid mock response');
}
const username = process.env.QA_LOGIN_NAME;
const password = process.env.QA_LOGIN_PIN;
if (Boolean(username) !== Boolean(password)) throw new Error('Supply both login variables, or neither');
const role = process.env.QA_LOGIN_ROLE;
const destinations = { admin: '/gestao/dashboard', manager: '/gestao/dashboard', waiter: '/operacao/garcom', kitchen: '/operacao/cozinha', cashier: '/operacao/caixa', delivery: '/operacao/entregas' };
if (username && (!destinations[role] || process.env.QA_ALLOW_LOGIN_WRITE !== '1')) throw new Error('Login requires role and QA_ALLOW_LOGIN_WRITE=1 (authentication_attempts writes)');

// A separately provisioned Playwright module is acceptable; no install or server startup here.
const modulePath = process.env.QA_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const browser = await chromium.launch();
const report = { item, stage, state, authenticated: Boolean(username), role: username ? role : null, captures: [], skipped: username ? [] : ['Authenticated screens: login variables absent'], review: 'Pending reviewer: eight design rules, contrast >=4.5, targets >=44px, grade >=B; synthetic states require manual validation' };
const out = path.join(EVIDENCE_ROOT, item, `${stage}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(out, { recursive: true });
try {
  for (const [width, height] of [[360,800], [390,844], [430,932], [1280,800], [1440,900]]) {
    for (const [brand, accent] of [['padrao', null], ['vermelha', '#C0262D'], ['amarela', '#F2C230']]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        // Do not persist cookies, traces, bodies, credentials or storageState.
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== base) return route.abort();
          if (!['GET', 'HEAD'].includes(request.method())) {
            if (!(username && request.method() === 'POST' && url.pathname === '/api/auth/login')) return route.abort();
          }
          return route.continue();
        });
        const page = await context.newPage();
        if (username) {
          await page.goto(`${base}/gestao`, { waitUntil: 'networkidle' });
          const result = await page.evaluate(async ({ username: name, password: pin }) => {
            const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: pin }) });
            const body = await response.json();
            return { status: response.status, role: body.role };
          }, { username, password });
          if (result.status !== 200 || result.role !== role) throw new Error('Login rejected or role mismatch; stopping without retry');
        }
        // Install mocks AFTER login. Match paths exactly, never rewrite app data.
        for (const [routePath, response] of Object.entries(mocks)) {
          await page.route(url => url.origin === base && url.pathname === routePath, async intercepted => {
            if (intercepted.request().method() !== 'GET') return intercepted.fallback();
            if (state === 'carregando') {
              await new Promise(resolve => page.once('close', resolve));
              return intercepted.abort().catch(() => {});
            }
            return intercepted.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) });
          });
        }
        const routes = username ? [destinations[role]] : ['/', '/menu', '/menu/entrega', '/menu/mesa/01', '/gestao', '/qa-rota-inexistente'];
        for (const route of routes) {
          const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
          if (state !== 'carregando') await page.waitForLoadState('networkidle');
          else await page.waitForTimeout(500); // Allow hydration while the selected GET remains pending.
          await page.evaluate(async () => { await document.fonts.ready; });
          if (accent) await page.evaluate(color => document.documentElement.style.setProperty('--brand-accent', color, 'important'), accent);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, accent: getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim() }));
          const file = `${route.replace(/[^a-z0-9]/gi, '_') || 'hub'}-${width}x${height}-${brand}-${state}.png`;
          await page.screenshot({ path: path.join(out, file), fullPage: true, animations: 'disabled', mask: [page.locator('input[autocomplete="username"], input[type="password"]')] });
          report.captures.push({ route, finalPath: new URL(page.url()).pathname, status: response?.status(), file, ...metrics });
        }
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2));
}
console.log(`Captures: ${out}`);
if (report.captures.some(capture => capture.overflow || (capture.status >= 400 && capture.route !== '/qa-rota-inexistente') || capture.finalPath !== capture.route)) process.exitCode = 1;
