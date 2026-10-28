import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(
  process.cwd(),
  true,
);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export function connectionString() {
  const value = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL não configurada.");
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech"))
    url.hostname = url.hostname.replace("-pooler.", ".");
  if (
    ["require", "prefer", "verify-ca"].includes(url.searchParams.get("sslmode"))
  )
    url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
export async function connect() {
  const client = new pg.Client({
    connectionString: connectionString(),
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return client;
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function schemaFingerprint(client) {
  const sql = `SELECT table_name, column_name, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'app_migrations'
    ORDER BY table_name, ordinal_position`;
  const columns = (await client.query(sql)).rows;
  const constraints = (
    await client.query(`SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname <> 'app_migrations' ORDER BY c.relname, con.conname`)
  ).rows;
  return { columns, constraints };
}
async function run() {
  const mode = process.argv[2] || "status";
  if (mode === "explain-generation")
    throw new Error(
      "Migrações deste projeto são SQL versionado. Use db:status e db:migrate; o schema Drizzle vazio não é fonte para gerar exclusões.",
    );
  const client = await connect();
  try {
    if (mode === "capture-baseline") {
      await writeFile(
        path.join(root, "db/legacy-baseline.json"),
        JSON.stringify(await schemaFingerprint(client), null, 2) + "\n",
        { flag: "wx" },
      );
      console.log(
        "Baseline estrutural registrado; nenhum dado pessoal incluído.",
      );
      return;
    }
    if (mode === "inspect") {
      await client.query("BEGIN READ ONLY");
      const tables = (
        await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows;
      const counts = {};
      for (const { tablename } of tables)
        counts[tablename] = (
          await client.query(
            `SELECT count(*)::int AS count FROM "${tablename.replaceAll('"', '""')}"`,
          )
        ).rows[0].count;
      console.log(
        JSON.stringify(
          { counts, schema: await schemaFingerprint(client) },
          null,
          2,
        ),
      );
      await client.query("ROLLBACK");
      return;
    }
    const files = (await readdir(path.join(root, "drizzle")))
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    const migrations = await Promise.all(
      files.map(async (name) => {
        const sql = await readFile(path.join(root, "drizzle", name), "utf8");
        return { name, sql, checksum: hash(sql) };
      }),
    );
    if (mode === "apply")
      await client.query(
        "SELECT pg_advisory_lock(hashtext('gestor-food:migrations'))",
      );
    const exists = (
      await client.query(
        "SELECT to_regclass('public.app_migrations') IS NOT NULL AS found",
      )
    ).rows[0].found;
    const applied = exists
      ? (
          await client.query(
            "SELECT name, checksum, origin FROM app_migrations ORDER BY name",
          )
        ).rows
      : [];
    for (const row of applied) {
      if (
        !migrations.some(
          (m) => m.name === row.name && m.checksum === row.checksum,
        )
      )
        throw new Error(`Migração alterada ou ausente: ${row.name}`);
    }
    const pending = migrations.filter(
      (m) => !applied.some((a) => a.name === m.name),
    );
    console.log(
      JSON.stringify(
        {
          applied: applied.map((r) => ({ name: r.name, origin: r.origin })),
          pending: pending.map((m) => m.name),
          legacyBaselineRequired: !exists,
        },
        null,
        2,
      ),
    );
    if (mode !== "apply") return;
    const backupArg = process.argv.find((a) => a.startsWith("--backup="));
    const { validateBackup, endpointFromUrl } = await import("./backup-logico.mjs");
    await validateBackup(
      backupArg?.slice(9), pending,
      backupArg?.endsWith(".manifest.json") ? endpointFromUrl(connectionString()) : null,
    );
    if (!exists) {
      const baseline = JSON.parse(
        await readFile(path.join(root, "db/legacy-baseline.json"), "utf8"),
      );
      if (
        JSON.stringify(await schemaFingerprint(client)) !==
        JSON.stringify(baseline)
      )
        throw new Error(
          "Schema difere do baseline revisado; inspecione antes de migrar.",
        );
      await client.query("BEGIN");
      await client.query(
        "CREATE TABLE app_migrations (name text PRIMARY KEY, checksum text NOT NULL, origin text NOT NULL CHECK(origin IN ('verified_legacy','applied')), recorded_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const m of migrations.filter((m) => m.name < "0006"))
        await client.query(
          "INSERT INTO app_migrations(name,checksum,origin) VALUES($1,$2,'verified_legacy')",
          [m.name, m.checksum],
        );
      await client.query("COMMIT");
    }
    for (const m of migrations) {
      if (
        (
          await client.query("SELECT 1 FROM app_migrations WHERE name=$1", [
            m.name,
          ])
        ).rowCount
      )
        continue;
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query(m.sql);
        await client.query(
          "INSERT INTO app_migrations(name,checksum,origin) VALUES($1,$2,'applied')",
          [m.name, m.checksum],
        );
        await client.query("COMMIT");
        console.log(`Aplicada ${m.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
