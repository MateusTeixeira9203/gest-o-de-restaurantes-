import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readFile, realpath, unlink, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export function endpointFromUrl(value) {
  const host = new URL(value).hostname;
  if (host.includes("-pooler")) throw new Error("Use o endpoint direto.");
  const endpoint = host.split(".")[0];
  if (!/^ep-[a-z0-9-]+$/.test(endpoint)) throw new Error("Endpoint inválido.");
  return endpoint;
}

export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function validateBackup(file, pending, endpoint, now = Date.now()) {
  if (pending.length > 1) throw new Error("Aplique uma única migração pendente por vez.");
  if (!file) throw new Error("Informe --backup=<arquivo>.");
  if (!file.endsWith(".manifest.json")) {
    const handle = await open(file, "r");
    try {
      const header = Buffer.alloc(5);
      await handle.read(header, 0, 5, 0);
      if (!header.equals(Buffer.from("PGDMP"))) throw new Error("Backup PGDMP inválido.");
      return;
    } finally { await handle.close(); }
  }
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const age = now - Date.parse(manifest.criado_em);
  if (manifest.formato !== "restrio-backup-logico-v1" || manifest.verificado !== true ||
      !Number.isFinite(age) || age < 0 || age > 2 * 60 * 60 * 1000 ||
      manifest.endpoint !== endpoint || pending.length !== 1 || manifest.migracao !== pending[0].name)
    throw new Error("Manifesto inválido, antigo ou incompatível com a migração e endpoint.");
  if (manifest.sha256 !== await sha256(file.replace(/\.manifest\.json$/, ".ndjson")))
    throw new Error("SHA256 do backup não confere.");
}

export async function backupDirectory(dir) {
  const resolved = await realpath(dir);
  const normalized = resolved.toLowerCase().replaceAll("\\", "/");
  const repo = (await realpath(root)).toLowerCase().replaceAll("\\", "/");
  if (normalized === repo || normalized.startsWith(repo + "/") || /\/nex lab(?:\/|$)/.test(normalized))
    throw new Error("Backup deve ficar fora do repositório e do cofre.");
  if (/onedrive|dropbox|google drive|icloud/.test(normalized))
    console.warn("Pasta sincronizada com a nuvem: o backup pode sair desta máquina.");
  return resolved;
}

async function exportTable(client, handle, table) {
  const identifier = `public."${table.replaceAll('"', '""')}"`;
  const expected = (await client.query(`SELECT count(*)::text AS count FROM ${identifier}`)).rows[0].count;
  await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS r FROM ${identifier} t`);
  let count = 0;
  for (;;) {
    const { rows } = await client.query("FETCH 100 FROM backup_rows");
    if (!rows.length) break;
    for (const { r } of rows) {
      await handle.writeFile('{"t":' + JSON.stringify(table) + ',"r":' + r + '}\n');
      count++;
    }
  }
  await client.query("CLOSE backup_rows");
  if (String(count) !== String(expected)) throw new Error("Contagem exportada não confere.");
  return count;
}

async function verifyCounts(file, tables) {
  const counts = Object.fromEntries(Object.keys(tables).map((name) => [name, 0]));
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    const row = JSON.parse(line);
    if (!Object.hasOwn(counts, row.t) || !Object.hasOwn(row, "r")) throw new Error("Linha inválida no backup.");
    counts[row.t]++;
  }
  if (JSON.stringify(counts) !== JSON.stringify(tables)) throw new Error("Contagem em disco não confere.");
}

export async function exportBackup(client, { dir, migracao, endpoint, now = new Date() }) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(migracao)) throw new Error("Migração inválida.");
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const base = path.join(dir, `backup-pre-${migracao.slice(0, -4)}-${date}`);
  const file = base + ".ndjson", manifestFile = base + ".manifest.json";
  const handles = [];
  const owned = [];
  try {
    for (const target of [file, manifestFile]) {
      handles.push(await open(target, "wx", 0o600));
      owned.push(target);
    }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = Object.create(null);
    const catalog = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1");
    for (const { table_name } of catalog.rows) tables[table_name] = await exportTable(client, handles[0], table_name);
    await handles[0].sync();
    await verifyCounts(file, tables);
    const manifest = { formato: "restrio-backup-logico-v1", criado_em: now.toISOString(), endpoint, migracao,
      sha256: await sha256(file), verificado: true, tabelas: tables };
    await handles[1].writeFile(JSON.stringify(manifest, null, 2) + "\n");
    await handles[1].sync();
    return manifest;
  } catch (error) {
    await Promise.all(handles.map((handle) => handle.close()));
    handles.length = 0;
    await Promise.all(owned.map((target) => unlink(target)));
    throw error;
  } finally {
    await Promise.all(handles.map((handle) => handle.close()));
    await client.query("ROLLBACK");
  }
}

async function main() {
  const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const migracao = arg("migracao");
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(migracao || "")) throw new Error("Informe --migracao=NNNN_nome.sql.");
  await access(path.join(root, "drizzle", migracao));
  const dir = await backupDirectory(arg("dir") || "C:\\Users\\mateu\\Desktop\\Evidencias\\Restrio");
  const { connect, connectionString } = await import("./database.mjs");
  const endpoint = endpointFromUrl(connectionString());
  const client = await connect();
  try {
    await exportBackup(client, { dir, migracao, endpoint });
    console.log("Backup conferido.");
  } finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Backup não concluído. Confira migração, pasta, endpoint e acesso ao banco; nenhum conteúdo será impresso.");
    process.exitCode = 1;
  });
}
