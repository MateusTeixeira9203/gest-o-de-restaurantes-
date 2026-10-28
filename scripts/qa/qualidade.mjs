// node scripts/qa/qualidade.mjs --baseline (once); omit the flag to enforce the gate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const qualityRules = ["complexity", "max-lines-per-function", "max-lines"];
function regressions(current, base) {
  const failures = [];
  for (const [name, code] of Object.entries(current.checks)) if (code !== 0) failures.push(`${name}: exit ${code}`);
  if (current.lint.errors) failures.push(`lint: ${current.lint.errors} errors`);
  if (current.lint.warnings > Math.min(3, base.lint.warnings)) failures.push("lint: warning count increased");
  for (const [category, count] of Object.entries(current.knip)) {
    if (count > (base.knip[category] ?? 0)) failures.push(`knip ${category}: ${base.knip[category] ?? 0} -> ${count}`);
  }
  if (current.duplication.percentage > Math.max(3, base.duplication.percentage)) failures.push("jscpd: percentage increased beyond threshold");
  if (current.duplication.clones > base.duplication.clones) failures.push("jscpd: new clone");
  for (const [file, findings] of Object.entries(current.complexity)) {
    const previous = base.complexity[file] ?? [];
    for (const rule of qualityRules) {
      if (findings.filter(item => item.ruleId === rule).length > previous.filter(item => item.ruleId === rule).length)
        failures.push(`${file}: new ${rule} finding`);
    }
    for (const finding of findings.filter(item => item.ruleId !== "max-lines")) {
      if (!previous.some(item => item.ruleId === finding.ruleId && item.message === finding.message))
        failures.push(`${file}: ${finding.message}`);
    }
  }
  return failures;
}

function selfTest() {
  const base = { checks: {typecheck:0,lint:0,build:0,unit:0}, lint:{errors:0,warnings:3}, knip:{files:2}, duplication:{clones:0,percentage:0}, complexity:{"lib/old.ts":[{ruleId:"max-lines",message:"Old file length"}]} };
  assert.deepEqual(regressions(base, base), []);
  for (const change of [
    value => value.checks.unit = 1,
    value => value.lint.warnings = 4,
    value => value.knip.files = 3,
    value => value.knip.exports = 1,
    value => value.duplication.clones = 1,
    value => value.duplication.percentage = 3.01,
    value => value.complexity["lib/new.ts"] = [{ruleId:"complexity",message:"New function over 15"}],
    value => value.complexity["lib/old.ts"].push({ruleId:"max-lines-per-function",message:"New function over 80"}),
  ]) {
    const current = structuredClone(base); change(current);
    assert.ok(regressions(current, base).length);
  }
  const shifted = structuredClone(base); shifted.complexity["lib/old.ts"][0].message = "Different old file length";
  assert.deepEqual(regressions(shifted, base), []);
  console.log("PASS gate self-test: unchanged baseline accepted; 8 regressions rejected; old file length exception preserved.");
}

function main() {
  const capture = process.argv.includes("--baseline");
  const baselineFile = resolve(process.env.QUALITY_BASELINE_FILE || join(homedir(), "Desktop", "Evidencias", "Restrio", "quality-baseline.json"));
  if (capture && existsSync(baselineFile)) throw new Error("Baseline already exists; review changes before replacing it.");
  if (!capture && !existsSync(baselineFile)) throw new Error("Run --baseline once before enforcing the gate.");
  const baseline = capture ? null : JSON.parse(readFileSync(baselineFile, "utf8"));
  const reports = join(tmpdir(), "restrio-qualidade", new Date().toISOString().replaceAll(/[:.]/g, "-"));
  mkdirSync(reports, { recursive: true });
  const preload = resolve("scripts/qa/sem-ambiente.cjs").replaceAll("\\", "/");
  const env = { ...process.env, npm_config_cache: join(tmpdir(), "restrio-npm-cache") };
  env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require=${JSON.stringify(preload)}`].filter(Boolean).join(" ");
  const npm = join(dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
  if (!existsSync(npm)) throw new Error("This runner requires the npm bundled with Node.js.");
  function git(args) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) throw new Error("Could not inspect Git state.");
    return result.stdout.trim();
  }
  const source = () => ({head:git(["rev-parse","HEAD"]),productStatus:git(["status","--short","--","app","components","lib","modules","hooks"])});
  const started = source();
  function run(name, args) {
    const result = spawnSync(process.execPath, args, { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(join(reports, `${name}.log`), (result.stdout ?? "") + (result.stderr ?? "") + (result.error?.message ?? ""));
    console.log(`${name}: exit ${result.status ?? "spawn error"}`);
    return result;
  }
  const checks = {};
  checks.typecheck = run("typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]).status;
  const lint = run("lint", ["node_modules/eslint/bin/eslint.js", ".", "--ignore-pattern", "dist", "--ignore-pattern", ".next", "--ignore-pattern", ".maestri", "-f", "json", "-o", join(reports,"lint.json")]);
  checks.lint = lint.status;
  checks.build = run("build", ["node_modules/next/dist/bin/next", "build", "--webpack"]).status;
  checks.unit = run("unit", ["scripts/qa/unitarios.mjs"]).status;
  const knip = run("knip", [npm, "--yes", "--package=knip@6.41.0", "knip", "--reporter", "json", "--no-exit-code"]);
  checks.knip = knip.status;
  writeFileSync(join(reports,"knip.json"),knip.stdout ?? "");
  const threshold = capture ? 100 : Math.max(3, baseline.duplication.percentage);
  checks.jscpd = run("jscpd", [npm, "--yes", "--package=jscpd@5.4.1", "jscpd", "app", "components", "lib", "modules", "hooks", "--min-lines", "30", "--threshold", String(threshold), "--ignore", "**/components/ui/**", "--reporters", "console,json", "--output", join(reports,"jscpd")]).status;
  const quality = run("complexity", ["node_modules/eslint/bin/eslint.js", "-c", "eslint.quality.config.mjs", "app", "components", "lib", "modules", "hooks", "-f", "json", "-o", join(reports,"complexity.json")]);
  // Exit 1 is expected for grandfathered quality findings; 2 means a tool failure.
  checks.complexityTool = quality.status === 1 ? 0 : quality.status;
  const lintRows = JSON.parse(readFileSync(join(reports,"lint.json"),"utf8"));
  const complexityRows = JSON.parse(readFileSync(join(reports,"complexity.json"),"utf8"));
  const knipRows = JSON.parse(knip.stdout).issues;
  const duplication = JSON.parse(readFileSync(join(reports,"jscpd/jscpd-report.json"),"utf8")).statistics.total;
  const knipCounts = {};
  for (const row of knipRows) for (const [category, findings] of Object.entries(row)) {
    if (Array.isArray(findings)) knipCounts[category] = (knipCounts[category] ?? 0) + findings.length;
  }
  const complexity = {};
  for (const row of complexityRows) {
    const findings = row.messages.filter(item => qualityRules.includes(item.ruleId));
    if (findings.length) complexity[relative(process.cwd(),row.filePath).replaceAll("\\","/")] = findings.map(({ruleId,message,line}) => ({ruleId,message,line}));
  }
  const current = {
    capturedAt: new Date().toISOString(), git: started,
    tools: {knip:"6.41.0",jscpd:"5.4.1",eslint:"9.39.4"}, checks,
    lint: {errors:lintRows.reduce((sum,row)=>sum+row.errorCount,0),warnings:lintRows.reduce((sum,row)=>sum+row.warningCount,0)},
    knip: knipCounts, duplication:{clones:duplication.clones,percentage:duplication.percentage}, complexity,
  };
  const failures = regressions(current, baseline ?? current);
  if (JSON.stringify(started) !== JSON.stringify(source())) failures.push("Git/product state changed during capture; rerun on a stable snapshot.");
  writeFileSync(join(reports,"summary.json"),JSON.stringify({...current,failures},null,2)+"\n");
  console.log(JSON.stringify({lint:current.lint,knip:current.knip,duplication:current.duplication,complexityFiles:Object.keys(complexity).length,failures,reports},null,2));
  if (!failures.length && capture) writeFileSync(baselineFile,JSON.stringify(current,null,2)+"\n");
  console.log(failures.length ? "FAIL quality gate" : capture ? "PASS baseline captured" : "PASS quality gate (no regression)");
  process.exitCode = failures.length ? 1 : 0;
}

try {
  if (process.argv.includes("--self-test")) selfTest(); else main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
