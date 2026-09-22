const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-report-templates-"));
try {
  for (const file of [
    "lib/metrics/catalog.ts",
    "lib/metrics/engine.ts",
    "lib/metrics/meta-events.ts",
    "lib/metrics/dates.ts",
    "lib/projects/model.ts",
    "lib/report-templates/index.ts",
  ]) {
    const output = path.join(dir, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith("@/")) return path.join(dir, request.slice(2) + ".js");
    return original.call(this, request, ...args);
  };
  const { buildReportMessage } = require(path.join(dir, "lib/report-templates/index.js"));
  const empty = Object.fromEntries([
    "spend", "impressions", "reach", "clicks", "link_clicks", "ctr", "cpc", "cpm", "frequency",
    "purchases", "revenue", "roas", "cpa", "messages", "cost_message", "leads", "cpl",
    "landing_views", "checkouts", "profile_visits", "followers", "engagements",
  ].map((metric) => [metric, null]));
  const message = buildReportMessage("sales", {
    client: "Cliente real",
    since: "2026-09-01",
    until: "2026-09-21",
    compareSince: "2026-08-11",
    compareUntil: "2026-08-31",
    currency: "BRL",
    primaryMetric: "purchases",
    metrics: ["purchases", "revenue", "roas", "cpa", "spend"],
    current: { ...empty, purchases: 12, revenue: 2400, roas: 4, cpa: 50, spend: 600 },
    previous: { ...empty, purchases: 0, revenue: 0, roas: null, cpa: null, spend: 500 },
  });
  assert.match(message, /Cliente real/);
  assert.match(message, /01\/09\/2026 a 21\/09\/2026/);
  assert.match(message, /Compras no site: 12 \(sem base comparável\)/);
  assert.match(message, /R\$\s*2\.400,00/);
  assert.doesNotMatch(message, /undefined|null/);
  console.log("PASS: templates de mensagem usam somente métricas reais e comparação canônica");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
