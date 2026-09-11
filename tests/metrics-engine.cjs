const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-metrics-test-"));
try {
  for (const name of ["catalog", "meta-events", "engine", "dates", "meta-adapters"]) {
    fs.writeFileSync(path.join(dir, `${name}.js`), ts.transpileModule(fs.readFileSync(`lib/metrics/${name}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  const engine = require(path.join(dir, "engine.js"));
  const dates = require(path.join(dir, "dates.js"));
  const adapters = require(path.join(dir, "meta-adapters.js"));
  const catalog = require(path.join(dir, "catalog.js"));
  const row = { spend: "120", impressions: "2000", reach: "800", clicks: "180", actions: [
    { action_type: "link_click", value: "100" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
    { action_type: "purchase", value: "99" }, { action_type: "lead", value: "8" },
    { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
  ], action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "480" }] };
  const values = engine.metaMetrics(row);
  assert.equal(values.purchases, 4); assert.equal(values.leads, 8); assert.equal(values.messages, 12); assert.equal(values.link_clicks, 100);
  const purchase = engine.primaryMetricSnapshot(row, { actions: [{ action_type: "lead", value: "20" }] }, "purchases");
  assert.equal(purchase.currentValue, 4); assert.equal(purchase.previousValue, 0); assert.equal(purchase.delta, null); assert.equal(purchase.comparable, false);
  const campaigns = engine.aggregateMetricValues([engine.metaMetrics({ spend: "10", reach: "100", impressions: "150" }), engine.metaMetrics({ spend: "20", reach: "80", impressions: "120" })], "campaign_collection");
  assert.equal(campaigns.spend, 30); assert.equal(campaigns.impressions, 270); assert.equal(campaigns.reach, null);
  assert.equal(engine.metaMetrics({ spend: "20", actions: [] }).cpa, null);
  assert.equal(engine.metaMetrics({ spend: "20" }).messages, null);
  assert.equal(engine.inferCalculationFormat("purchases", "leads", "add").valid, false);
  assert.deepEqual(engine.inferCalculationFormat("spend", "purchases", "divide"), { valid: true, format: "money" });
  assert.equal(catalog.primaryCostDefinition("purchases").shortLabel, "CPA");
  assert.equal(catalog.primaryCostDefinition("leads").shortLabel, "CPL");
  assert.equal(catalog.primaryCostDefinition("messages").label, "Custo por conversa");
  assert.equal(catalog.primaryCostDefinition("clicks").shortLabel, "CPC");
  assert.equal(catalog.primaryCostDefinition("profile_visits").label, "Custo por visita ao perfil");
  const custom = dates.resolvePeriod("custom", "America/Sao_Paulo", { since: "2026-02-01", until: "2026-02-10" }, "custom", { since: "2025-12-20", until: "2025-12-29" });
  assert.equal(custom.compare_since, "2025-12-20"); assert.equal(custom.compare_until, "2025-12-29");
  const rollover = dates.resolvePeriod("last_7d", "America/Sao_Paulo", { since: "2020-01-01", until: "2020-01-01" }, "previous", undefined, new Date("2026-01-01T02:30:00Z"));
  assert.equal(rollover.until, "2025-12-31");
  assert.throws(() => dates.resolvePeriod("custom", "UTC", { since: "2026-02-10", until: "2026-02-01" }, "none", undefined, new Date("2026-03-01T12:00:00Z")), /data inicial/);
  assert.throws(() => dates.resolvePeriod("custom", "UTC", { since: "2026-01-01", until: "2027-01-02" }, "none", undefined, new Date("2027-02-01T12:00:00Z")), /máximo 366/);
  assert.throws(() => dates.resolvePeriod("custom", "UTC", { since: "2026-03-01", until: "2026-03-02" }, "none", undefined, new Date("2026-03-01T12:00:00Z")), /futuras/);
  assert.throws(() => dates.resolvePeriod("custom", "UTC", { since: "2026-02-01", until: "2026-02-10" }, "custom", { since: "2026-01-25", until: "2026-02-03" }, new Date("2026-03-01T12:00:00Z")), /sobrepor/);
  assert.throws(() => dates.resolvePeriod("custom", "UTC", { since: "2026-02-01", until: "2026-02-10" }, "custom", { since: "2026-01-01", until: "2026-01-05" }, new Date("2026-03-01T12:00:00Z")), /mesma duração/);

  const fixture = JSON.parse(fs.readFileSync("tests/fixtures/meta-insights.json", "utf8"));
  for (const kpi of ["purchases", "leads", "messages", "link_clicks"]) {
    const modern = adapters.adaptModernMeta(fixture, kpi);
    const legacy = adapters.adaptLegacyMeta(fixture, kpi);
    assert.equal(legacy.primaryMetricId, modern.primaryMetricId);
    assert.deepEqual(legacy.current, modern.current);
    assert.deepEqual(legacy.previous, modern.previous);
    assert.equal(legacy.delta, modern.delta);
    assert.deepEqual(legacy.series, modern.series);
    assert.deepEqual(legacy.campaigns, modern.campaigns);
    assert.deepEqual(legacy.objectiveDistribution, modern.objectiveDistribution);
  }
  assert.equal(adapters.adaptModernMeta(fixture, "purchases").current.purchases, 27, "aliases equivalentes não são somados");
  assert.equal(fs.readFileSync("lib/integrations/meta-dashboard.ts", "utf8").includes("adaptLegacyMeta"), true);
  assert.equal(fs.readFileSync("lib/projects/meta.ts", "utf8").includes("adaptModernMeta"), true);
  console.log("PASS: compra, lead, mensagem, clique, comparação, alcance, dimensões, fuso e reconciliação");
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
