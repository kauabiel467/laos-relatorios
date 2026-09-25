const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");

// Metric cards: the daily-evolution chart is OFF by default for new dashboards, while
// dashboards saved before the default existed (and the reports already published or
// frozen from them) keep looking exactly as they did.

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "laos-card-charts-")));
const original = Module._resolveFilename;

try {
  for (const [file, out] of [
    ["lib/metrics/catalog.ts"], ["lib/metrics/meta-events.ts"], ["lib/metrics/engine.ts"], ["lib/metrics/dates.ts"],
    ["lib/projects/model.ts"], ["lib/projects/schema.ts"], ["components/projects/metric-cards.ts"],
  ]) {
    const output = path.join(dir, (out ?? file).replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  // metric-cards only needs shortDate from the React helpers module.
  fs.writeFileSync(path.join(dir, "components/projects/ui.js"), "exports.shortDate = (value) => value;");
  const zodPath = require.resolve("zod");
  Module._resolveFilename = function (request, ...args) {
    if (request === "zod") return zodPath;
    if (request.startsWith("@/")) {
      const target = path.join(dir, request.slice(2));
      return fs.existsSync(`${target}.js`) ? `${target}.js` : path.join(target, "index.js");
    }
    return original.call(this, request, ...args);
  };
  const model = require(path.join(dir, "lib/projects/model.js"));
  const { configSchema } = require(path.join(dir, "lib/projects/schema.js"));
  const cards = require(path.join(dir, "components/projects/metric-cards.js"));

  const config = model.defaultConfig("sales");
  const metrics = Object.fromEntries(require(path.join(dir, "lib/metrics/catalog.js")).METRIC_IDS.map((id, index) => [id, (index + 1) * 10]));
  const data = {
    current: metrics, previous: metrics,
    daily: [{ date: "2026-08-01", metrics }, { date: "2026-08-02", metrics }],
    campaigns: [], adsets: [], ads: [], platforms: [], audience: [], warnings: [],
    currency: "BRL", timezone: "America/Sao_Paulo", updated_at: "2026-09-01T00:00:00Z",
  };
  const chartOf = (cfg, id = "spend") => cards.deriveMetricCard(id, cfg, data, "BRL").props.showChart;

  // New dashboards start without the chart, on every metric, including ones added later.
  assert.equal(config.metric_charts_default, false, "a new dashboard's default is charts hidden");
  assert.equal(configSchema.safeParse(config).success, true, "and it is a valid config");
  for (const id of config.metric_order) assert.equal(chartOf(config, id), false, `${id} starts without its chart`);
  assert.equal(chartOf(config, "cpc"), false, "a metric added afterwards, with no entry, also starts hidden");

  // Turning one on works, and only that one.
  const oneOn = { ...config, metric_charts: { spend: true } };
  assert.equal(chartOf(oneOn, "spend"), true);
  assert.equal(chartOf(oneOn, config.metric_order.find((id) => id !== "spend")), false);

  // Configs saved BEFORE the field existed are untouched: charts still show, explicit false still hides.
  const { metric_charts_default: _drop, ...legacy } = config;
  void _drop;
  assert.equal("metric_charts_default" in legacy, false);
  assert.equal(configSchema.safeParse(legacy).success, true, "a legacy config is still valid");
  assert.equal(chartOf(legacy, "spend"), true, "legacy: no entry keeps showing the chart");
  assert.equal(chartOf({ ...legacy, metric_charts: { spend: false } }, "spend"), false, "legacy: an explicit hide is kept");
  assert.equal(chartOf({ ...legacy, metric_charts: { spend: false } }, "reach"), true);

  // "Ocultar/Exibir todos": the field flips the default and the per-card entries are cleared.
  assert.equal(chartOf({ ...legacy, metric_charts_default: false, metric_charts: {} }, "spend"), false);
  assert.equal(chartOf({ ...config, metric_charts_default: true, metric_charts: {} }, "spend"), true);

  // The field survives normalization (it is what makes the default stick after saving).
  assert.equal(model.normalizeAnalysisConfig(config).metric_charts_default, false);
  assert.equal(model.normalizeAnalysisConfig(legacy).metric_charts_default, undefined, "normalizing does not turn a legacy config into a new one");
  assert.equal(configSchema.safeParse({ ...config, metric_charts_default: "no" }).success, false);

  // Static guards: one rule for the card, and the editor's toggle honours the default.
  const source = fs.readFileSync("components/projects/metric-cards.ts", "utf8");
  assert.match(source, /showChart: config\.metric_charts\?\.\[id\] \?\? config\.metric_charts_default \?\? true/);
  const editor = fs.readFileSync("components/projects/analysis-view.tsx", "utf8");
  assert.match(editor, /const chartVisible = \(id: string\) => config\.metric_charts\?\.\[id\] \?\? chartsDefault/);
  assert.match(editor, /\[id\]: !chartVisible\(id\)/, "the toggle flips what the card currently shows");
  assert.match(editor, /setAllCharts\(!anyChartVisible\)/);

  console.log("PASS: gráfico dos cards começa oculto em dashboards novos e não altera os já salvos");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
