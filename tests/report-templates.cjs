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
  const { buildReportMessage, reportTemplateAvailable, REPORT_MESSAGE_TEMPLATES } =
    require(path.join(dir, "lib/report-templates/index.js"));
  const empty = Object.fromEntries([
    "spend", "impressions", "reach", "clicks", "link_clicks", "ctr", "cpc", "cpm", "frequency",
    "purchases", "revenue", "roas", "cpa", "messages", "cost_message", "leads", "cpl",
    "landing_views", "checkouts", "profile_visits", "followers", "engagements",
  ].map((metric) => [metric, null]));

  // Sales: header format, bold client/title, dd/mm dates (no year), computed
  // ticket médio, and no leftover comparison text even though compareSince/
  // compareUntil/previous are supplied - the message must ignore them.
  const sales = buildReportMessage("sales", {
    client: "Cliente real",
    since: "2026-09-01",
    until: "2026-09-21",
    compareSince: "2026-08-11",
    compareUntil: "2026-08-31",
    currency: "BRL",
    primaryMetric: "purchases",
    metrics: ["purchases", "revenue", "roas", "cpa", "spend"],
    current: { ...empty, purchases: 12, revenue: 2400, roas: 4, cpa: 50, spend: 600, reach: 9000 },
    previous: { ...empty, purchases: 0, revenue: 0, roas: null, cpa: null, spend: 500 },
  });
  const salesLines = sales.split("\n");
  assert.equal(salesLines[0], "*Cliente real*");
  assert.equal(salesLines[1], "");
  assert.equal(salesLines[2], "Segue o relatório do período:");
  assert.equal(salesLines[3], "📆 (01/09 a 21/09)");
  assert.equal(salesLines[4], "");
  assert.equal(salesLines[5], "*CAMPANHA DE VENDAS:*");
  assert.equal(salesLines[6], "");
  assert.match(salesLines[7], /^💰 Investimento total: R\$\s*600,00$/);
  assert.match(salesLines[8], /^📊 Alcance: 9\.000 pessoas$/);
  assert.match(salesLines[9], /^🛒 Vendas: 12$/);
  assert.match(salesLines[10], /Ticket médio: R\$\s*200,00$/);
  assert.match(salesLines[11], /Custo por venda: R\$\s*50,00$/);
  assert.match(salesLines[12], /Valor total em vendas: R\$\s*2\.400,00$/);
  assert.match(salesLines[13], /ROAS: 4×$/);
  assert.equal(salesLines.length, 14);
  assert.doesNotMatch(sales, /vs\.|anterior|Comparação|undefined|null|2026-08/);

  // Traffic (new template): the exact worked example from the spec.
  const traffic = buildReportMessage("traffic", {
    client: "Fresh Burguer",
    since: "2026-09-11",
    until: "2026-09-13",
    currency: "BRL",
    primaryMetric: "landing_views",
    metrics: ["landing_views"],
    current: { ...empty, spend: 156.77, reach: 2484, landing_views: 64 },
    previous: null,
  });
  const trafficLines = traffic.split("\n");
  assert.equal(trafficLines[0], "*Fresh Burguer*");
  assert.equal(trafficLines[3], "📆 (11/09 a 13/09)");
  assert.equal(trafficLines[5], "*CAMPANHA DE TRÁFEGO PARA CARDÁPIO:*");
  assert.match(trafficLines[7], /^💰 Investimento total: R\$\s*156,77$/);
  assert.match(trafficLines[8], /^📊 Alcance: 2\.484 pessoas$/);
  assert.match(trafficLines[9], /Visualizações no Cardápio: 64$/);
  assert.match(trafficLines[10], /Custo por visualização: R\$\s*2,45$/);
  assert.equal(trafficLines.length, 11);

  // Availability: traffic must NOT read as available on spend/reach alone -
  // the whole point of leaving spend out of its metrics list.
  const trafficTemplate = REPORT_MESSAGE_TEMPLATES.find((item) => item.id === "traffic");
  assert.equal(
    reportTemplateAvailable(trafficTemplate, {
      client: "x", since: "2026-01-01", until: "2026-01-02", currency: "BRL",
      primaryMetric: "purchases", metrics: ["spend", "reach"],
      current: { ...empty, spend: 100, reach: 50 }, previous: null,
    }),
    false,
  );
  assert.equal(
    reportTemplateAvailable(trafficTemplate, {
      client: "x", since: "2026-01-01", until: "2026-01-02", currency: "BRL",
      primaryMetric: "purchases", metrics: ["landing_views"],
      current: { ...empty, landing_views: 10 }, previous: null,
    }),
    true,
  );

  // Division-by-zero / missing-denominator fields fall back to the em dash,
  // never NaN or Infinity.
  const zeroPurchases = buildReportMessage("sales", {
    client: "x", since: "2026-01-01", until: "2026-01-02", currency: "BRL",
    primaryMetric: "purchases", metrics: ["purchases", "revenue"],
    current: { ...empty, purchases: 0, revenue: 500, spend: 100 }, previous: null,
  });
  assert.match(zeroPurchases, /Ticket médio: —/);
  assert.doesNotMatch(zeroPurchases, /NaN|Infinity/);

  // Messages and followers: new field sets, no stray metrics from the old
  // bullet format (link_clicks / engagements are no longer shown).
  const messages = buildReportMessage("messages", {
    client: "x", since: "2026-01-01", until: "2026-01-31", currency: "BRL",
    primaryMetric: "messages", metrics: ["messages", "cost_message", "spend"],
    current: { ...empty, spend: 300, reach: 4000, messages: 60, cost_message: 5 }, previous: null,
  });
  assert.match(messages, /\*CAMPANHA DE MENSAGENS:\*/);
  assert.match(messages, /💬 Número de mensagens: 60/);
  assert.match(messages, /💵 Custo por mensagem: R\$\s*5,00/);
  assert.doesNotMatch(messages, /Cliques no link|link_clicks/);

  const followers = buildReportMessage("followers", {
    client: "x", since: "2026-01-01", until: "2026-01-31", currency: "BRL",
    primaryMetric: "followers", metrics: ["followers", "profile_visits", "spend"],
    current: { ...empty, spend: 200, reach: 5000, profile_visits: 100, followers: 25 }, previous: null,
  });
  assert.match(followers, /\*CAMPANHA DE SEGUIDORES:\*/);
  assert.match(followers, /➕ Novos seguidores: 25/);
  assert.match(followers, /💵 Custo por visita ao perfil: R\$\s*2,00/);
  assert.match(followers, /💰 Custo por seguidor: R\$\s*8,00/);
  assert.doesNotMatch(followers, /Engajamentos|engagements/);

  const overview = buildReportMessage("overview", {
    client: "x", since: "2026-01-01", until: "2026-01-31", currency: "BRL",
    primaryMetric: "purchases", metrics: [],
    current: { ...empty, purchases: 8, spend: 400, reach: 6000, impressions: 20000 }, previous: null,
  });
  assert.match(overview, /\*RESUMO DO RELATÓRIO:\*/);
  assert.match(overview, /Compras no site: 8/);
  assert.match(overview, /👁️ Impressões: 20\.000/);

  console.log("PASS: modelos de mensagem batem com o padrão WhatsApp da agência (5 modelos, sem comparação, datas dd/mm)");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
