import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { EVIDENCE_ROOT } from './safety.mjs';

const root = path.join(EVIDENCE_ROOT, 'capturas-a4-2026-10-28');
const manifests = [];
for (const dir of await readdir(root)) {
  const report = JSON.parse(await readFile(path.join(root, dir, 'manifest.json'), 'utf8'));
  manifests.push({ dir, ...report });
}
const captures = manifests.flatMap(r => r.captures.filter(c => c.route !== '/gestao/salao').map(c => ({ dir: r.dir, ...c })));
const required = [['public', '/'], ['public', '/menu'], ['manager', '/operacao'], ['manager', '/gestao/dashboard'], ['waiter', '/operacao/garcom'], ['kitchen', '/operacao/cozinha'], ['delivery', '/operacao/entregas'], ['cashier', '/operacao/caixa']];
for (const [role, route] of required) for (const width of [360, 390, 430, 1280, 1440]) for (const brand of ['padrao', 'vermelha', 'amarela']) {
  assert.ok(captures.some(c => c.role === role && c.route === route && c.width === width && c.brand === brand), `Missing ${role} ${route} ${width} ${brand}`);
}
for (const c of captures) {
  await access(path.join(root, c.dir, c.file));
  assert.equal(c.overflow, false);
  assert.equal(c.console.length, 0);
  assert.equal(c.network.length, 0);
  assert.equal(c.status, 200);
  assert.equal(c.finalPath, c.route);
  for (const sample of c.contrastSamples) if (sample.contrast !== null) assert.ok(sample.contrast >= 4.5);
}
for (const report of manifests) assert.deepEqual(report.cleanup, { staffRemaining: 0, attemptsRemaining: 0, exactIdsOnly: true });
assert.ok(manifests.some(r => r.failure?.message === 'Intentional harness failure after fixture creation'));
console.log(JSON.stringify({ validCaptures: captures.length, excludedWrongRoute: manifests.reduce((n, r) => n + r.captures.filter(c => c.route === '/gestao/salao').length, 0), requiredMatrix: `${required.length} screens x 5 widths x 3 brands verified`, filesExist: true, overflow: 0, consoleErrorsAndWarnings: 0, failedHTTP: 0, contrastSamples: captures.reduce((n, c) => n + c.contrastSamples.length, 0), allMeasuredContrastAtLeast: 4.5, cleanupAllRuns: 'zero residues, including intentional failure', productFindings: manifests.flatMap(r => r.checks.filter(c => c.passed === false)), limits: ['Contrast is sampled visible buttons, not a full text contrast audit.', 'Small target counts include Next dev tools and require reviewer triage.', 'Captured live empty queues; no order/payment/stock writes.', 'Not approval of A1/A2/A3/A8/A7 or the full design gate.'] }, null, 2));
