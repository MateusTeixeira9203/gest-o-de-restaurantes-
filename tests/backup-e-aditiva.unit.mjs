import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { exportBackup, validateBackup, sha256, endpointFromUrl, backupDirectory } from "../scripts/backup-logico.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "restrio-backup-"));
const migracao = "0019_delivery_payment_intent.sql";
const endpoint = "ep-falso-000000";
const now = new Date(2026, 9, 28, 12, 34);
const raw = '{"n":12345678901234567890,"v":"1234.567","b":"\\\\x00ff","s":"DADO_SINTETICO_NAO_IMPRIMIR"}';
function mockClient(mismatch = false) {
  const queries = [];
  let current, offset;
  const data = { app_migrations: [raw], 'tab"ela': Array(1203).fill(raw), tabela_nova_sintetica: [] };
  return { queries, async query(sql) {
    queries.push(sql);
    if (sql.includes("information_schema.tables")) return { rows: Object.keys(data).map(table_name => ({ table_name })) };
    if (sql.startsWith("SELECT count")) {
      current = Object.keys(data).find(name => sql.includes('"' + name.replaceAll('"', '""') + '"'));
      return { rows: [{ count: String(data[current].length + (mismatch ? 1 : 0)) }] };
    }
    if (sql.startsWith("DECLARE")) offset = 0;
    if (sql.startsWith("FETCH")) {
      const rows = data[current].slice(offset, offset + 100).map(r => ({ r }));
      offset += 100;
      return { rows };
    }
    return { rows: [] };
  } };
}
try {
  const client = mockClient();
  const manifest = await exportBackup(client, { dir, migracao, endpoint, now });
  const files = await readdir(dir);
  const manifestFile = path.join(dir, files.find(f => f.endsWith(".manifest.json")));
  assert.equal(path.basename(manifestFile), "backup-pre-0019_delivery_payment_intent-2026-10-28-1234.manifest.json");
  const ndjson = manifestFile.replace(/\.manifest\.json$/, ".ndjson");
  const lines = (await readFile(ndjson, "utf8")).trim().split("\n");
  assert.equal(client.queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(client.queries.at(-1), "ROLLBACK");
  assert(client.queries.every(sql => /^(BEGIN|ROLLBACK|SELECT|DECLARE|FETCH|CLOSE)\b/.test(sql)));
  assert.equal(client.queries.filter(sql => sql.startsWith("FETCH")).length, 17);
  assert.equal(lines.length, 1204);
  assert.equal(lines[1], '{"t":"tab\\\"ela","r":' + raw + '}');
  assert.equal(JSON.parse(lines[1]).t, 'tab"ela');
  assert.deepEqual({ ...manifest.tabelas }, { app_migrations: 1, 'tab"ela': 1203, tabela_nova_sintetica: 0 });
  assert.equal(manifest.sha256, await sha256(ndjson));
  const pending = [{ name: migracao }];
  await validateBackup(manifestFile, pending, endpoint, now.getTime());
  console.log("OK snapshot, catálogo, precisão, escape, lotes, manifesto válido e SHA256");
  for (const patch of [
    { criado_em: new Date(now.getTime() - 7200001).toISOString() },
    { criado_em: "inválido" }, { criado_em: new Date(now.getTime() + 1000).toISOString() },
    { endpoint: "ep-outro" }, { sha256: "errado" }, { migracao: "0020_outra.sql" },
    { verificado: false }, { formato: "falso" },
  ]) {
    await writeFile(manifestFile, JSON.stringify({ ...manifest, ...patch }));
    await assert.rejects(validateBackup(manifestFile, pending, endpoint, now.getTime()));
  }
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(validateBackup(manifestFile, [...pending, { name: "0020_outra.sql" }], endpoint));
  await assert.rejects(validateBackup(manifestFile, [], endpoint));
  const dump = path.join(dir, "original.dump");
  await writeFile(dump, "PGDMPsimulado");
  await validateBackup(dump, pending, null);
  await validateBackup(dump, [...pending, ...pending], null);
  await validateBackup(dump, [], null);
  await writeFile(dump, "falso");
  await assert.rejects(validateBackup(dump, pending, null));
  console.log("OK manifesto antigo/futuro/inválido, endpoint, hash, migração, verificado, formato, duas pendentes e PGDMP");
  const before = await sha256(ndjson);
  await assert.rejects(exportBackup(mockClient(), { dir, migracao, endpoint, now }));
  assert.equal(await sha256(ndjson), before);
  await exportBackup(mockClient(), { dir, migracao, endpoint, now: new Date(now.getTime() + 60000) });
  assert((await readdir(dir)).includes("backup-pre-0019_delivery_payment_intent-2026-10-28-1235.manifest.json"));
  const onlyManifest = await mkdtemp(path.join(dir, "existing-"));
  await writeFile(path.join(onlyManifest, path.basename(manifestFile)), "preservar");
  await assert.rejects(exportBackup(mockClient(), { dir: onlyManifest, migracao, endpoint, now }));
  assert.deepEqual(await readdir(onlyManifest), [path.basename(manifestFile)]);
  const badDir = await mkdtemp(path.join(dir, "bad-"));
  const bad = mockClient(true);
  await assert.rejects(exportBackup(bad, { dir: badDir, migracao, endpoint, now }));
  assert.deepEqual(await readdir(badDir), []);
  assert.equal(bad.queries.at(-1), "ROLLBACK");
  await assert.rejects(backupDirectory(process.cwd()));
  const otherClone = await mkdtemp(path.join(dir, "GEST-O-DE-RESTAURANTES-outro-"));
  await assert.rejects(backupDirectory(otherClone));
  const missingMigration = spawnSync(process.execPath, ["scripts/backup-logico.mjs", "--migracao=9999_sintetica_ausente.sql"], { encoding: "utf8" });
  assert.equal(missingMigration.status, 1);
  assert.equal(missingMigration.stderr.trim(), "ENOENT");
  assert.equal(missingMigration.stdout, "");
  assert.equal(endpointFromUrl("postgres://usuario:senha@ep-falso-000000.neon.tech/db"), endpoint);
  assert.throws(() => endpointFromUrl("postgres://u:s@ep-falso-000000-pooler.neon.tech/db"));
  console.log("OK recusa sobrescrita dos dois arquivos, limpeza após erro, rollback, pasta e pooler; sem banco/rede/env");
} finally { await rm(dir, { recursive: true, force: true }); }
