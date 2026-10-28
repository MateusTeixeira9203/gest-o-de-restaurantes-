// Explicit offline allowlist: never run integration suites from this command.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";

const tests = [
  ["tests/a1-kitchen.unit.mjs"],
  ["tests/a12-prep.unit.mjs"],
  ["tests/auth-team.unit.mjs"],
  ["tests/backup-e-aditiva.unit.mjs"],
  ["tests/fiscal.unit.mjs"],
  ["tests/fiscal-readiness.unit.mjs"],
  ["tests/planning.unit.mjs"],
  ["tests/restaurante-teste.unit.mjs"],
  ["tests/pix.test.mjs"],
  ["tests/selos.unit.mjs"],
  ["tests/qa/safety.test.mjs"],
  ["tests/channel-orders.integration.mjs", "--unit"],
  ["scripts/qa/qualidade.mjs", "--self-test"],
];
const env = { ...process.env };
const preload = resolve("scripts/qa/sem-ambiente.cjs").replaceAll("\\", "/");
env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require=${JSON.stringify(preload)}`].filter(Boolean).join(" ");
// The existing fiscal ZIP test uses unzip. Git for Windows supplies the executable.
const gitBin = "C:/Program Files/Git/usr/bin";
if (process.platform === "win32" && existsSync(`${gitBin}/unzip.exe`)) {
  const key = Object.keys(env).find(name => name.toLowerCase() === "path") || "PATH";
  env[key] = gitBin + delimiter + env[key];
}
let failed = 0;
for (const args of tests) {
  console.log(`\nUNIT ${args.join(" ")}`);
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed++;
}
console.log(`UNIT SUMMARY: ${tests.length - failed}/${tests.length} commands passed; no database suite executed.`);
process.exitCode = failed ? 1 : 0;
