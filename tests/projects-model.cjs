const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-projects-test-"));
try {
  for (const file of ["lib/metrics/catalog.ts", "lib/metrics/meta-events.ts", "lib/metrics/engine.ts", "lib/metrics/dates.ts", "lib/projects/model.ts", "lib/projects/schema.ts"]) {
    const output = path.join(dir, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  const zodPath = require.resolve("zod");
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    if (request === "zod") return zodPath;
    if (request.startsWith("@/")) return path.join(dir, request.slice(2) + ".js");
    return original.call(this, request, ...args);
  };
  const model = require(path.join(dir, "lib/projects/model.js"));
  const { configSchema } = require(path.join(dir, "lib/projects/schema.js"));
  assert.deepEqual(model.periodDates("last_month", new Date(2024, 2, 15)), { since: "2024-02-01", until: "2024-02-29" });
  assert.deepEqual(model.previousDates("2026-08-01", "2026-08-31"), { compare_since: "2026-07-01", compare_until: "2026-07-31" });
  assert.equal(model.metricChange(10, 0), null);
  assert.equal(model.metricChange(0, 10), -100);
  const config = model.defaultConfig("messages");
  assert.equal(config.primary_metric, "messages");
  assert.equal(configSchema.safeParse(config).success, true);
  assert.equal(configSchema.safeParse({ ...config, primary_metric: "purchases" }).success, false);
  assert.equal(configSchema.safeParse({ ...config, metrics: ["spend", "spend"] }).success, false);
  console.log("PASS: configuração explícita de KPI, períodos e validação do documento");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
