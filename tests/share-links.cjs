const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const Module = require("node:module");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-share-links-"));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

// Minimal stand-in for agency_documents: enough to exercise the app-side
// publication/share logic, including the content_hash trigger and the column
// projection that keeps published_snapshot away from the browser.
function fakeDocumentsDb(rows) {
  const hash = (row) => crypto.createHash("md5").update(`${row.title}|${JSON.stringify(row.config)}|${JSON.stringify(row.data)}`).digest("hex");
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "agency_documents");
      const state = { filters: [], op: "read", values: null, columns: null };
      const query = {
        update(values) { state.op = "update"; state.values = values; return query; },
        select(columns) { state.columns = columns; return query; },
        eq(key, value) { state.filters.push([key, (row) => row[key] === value]); return query; },
        is(key, value) { state.filters.push([key, (row) => (row[key] ?? null) === value]); return query; },
        async maybeSingle() { return query.single(); },
        async single() {
          const row = rows.find((candidate) => state.filters.every(([, test]) => test(candidate)));
          if (!row) return { data: null, error: { code: "PGRST116" } };
          if (state.op === "update") {
            calls.push(state.values);
            if (state.values.share_token && rows.some((other) => other !== row && other.share_token === state.values.share_token)) {
              return { data: null, error: { code: "23505" } };
            }
            Object.assign(row, state.values);
            if ("title" in state.values || "config" in state.values || "data" in state.values) row.content_hash = hash(row);
          }
          const wanted = state.columns ? state.columns.split(",") : Object.keys(row);
          return { data: Object.fromEntries(wanted.map((column) => [column, row[column] ?? null])), error: null };
        },
      };
      return query;
    },
    edit(row, changes) {
      Object.assign(row, changes);
      row.content_hash = hash(row);
    },
    seed(row) {
      row.content_hash = hash(row);
      return row;
    },
  };
}

async function main() {
  for (const file of [
    ...["catalog", "meta-events", "engine", "dates"].map((name) => `lib/metrics/${name}.ts`),
    ...["model", "routes", "publication", "share-messages", "documents", "public-report"].map((name) => `lib/projects/${name}.ts`),
  ]) {
    const output = path.join(dir, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }

  class ProjectAccessError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  let publicRpc = null;
  let publicClientCalls = 0;
  let previewRows = [];
  const zodPath = require.resolve("zod");
  Module._resolveFilename = function (request, ...args) {
    if (request === "zod") return zodPath;
    if (request.startsWith("@/")) return path.join(dir, request.slice(2) + ".js");
    return originalResolve.call(this, request, ...args);
  };
  Module._load = function (request, ...args) {
    if (request === "@/lib/projects/meta") return { collectAnalysis: async () => ({}) };
    if (request === "@/lib/projects/access") {
      return {
        ProjectAccessError,
        authorizeProject: async () => ({ db: fakeDocumentsDb(previewRows), client: { id: "c1", name: "Fresh Burguer", logo_url: "https://logo.example/f.png" } }),
      };
    }
    if (request === "@/lib/supabase/server") {
      return {
        getSupabasePublicClient: () => {
          publicClientCalls += 1;
          return { rpc: (name, params) => ({ maybeSingle: async () => publicRpc(name, params) }) };
        },
      };
    }
    return originalLoad.call(this, request, ...args);
  };

  const publication = require(path.join(dir, "lib/projects/publication.js"));
  const messages = require(path.join(dir, "lib/projects/share-messages.js"));
  const documents = require(path.join(dir, "lib/projects/documents.js"));
  const reports = require(path.join(dir, "lib/projects/public-report.js"));

  // ---- WhatsApp / e-mail text -------------------------------------------------
  const input = { clientName: "Fresh Burguer", since: "2026-09-01", until: "2026-09-21", link: "https://laos.example/report/abc" };
  assert.equal(messages.formatShareDate("2026-09-01"), "01/09/2026");
  const whatsapp = messages.buildWhatsAppShareUrl(input);
  assert.ok(whatsapp.startsWith("https://wa.me/?text="));
  assert.equal(
    decodeURIComponent(whatsapp.slice("https://wa.me/?text=".length)),
    "Olá!\n\nSegue o relatório de desempenho de Fresh Burguer.\n\nPeríodo:\n01/09/2026 a 21/09/2026\n\nAcesse o relatório:\nhttps://laos.example/report/abc",
  );
  const mailParams = new URLSearchParams(messages.buildEmailShareUrl(input).slice("mailto:?".length));
  assert.equal(mailParams.get("subject"), "Relatório de desempenho — Fresh Burguer");
  assert.equal(
    mailParams.get("body"),
    "Olá,\n\nSegue o relatório de desempenho referente ao período de 01/09/2026 a 21/09/2026.\n\nhttps://laos.example/report/abc",
  );
  assert.ok(!messages.buildEmailShareUrl(input).includes("+"), "mailto must encode spaces as %20");
  assert.equal(messages.buildWhatsAppShareUrl({ ...input, clientName: "Açaí & Cia #1" }).includes("&"), false, "special characters must be percent-encoded");

  // ---- publication helpers ----------------------------------------------------
  assert.equal(publication.hasPublishedVersion({ kind: "dashboard", published_at: null }), false);
  assert.equal(publication.hasPublishedVersion({ kind: "report", published_at: "2026-09-01" }), false);
  assert.equal(publication.hasUnpublishedChanges({ kind: "dashboard", published_at: "2026-09-01", content_hash: "b", published_hash: "a" }), true);
  assert.equal(publication.hasUnpublishedChanges({ kind: "dashboard", published_at: "2026-09-01", content_hash: "a", published_hash: "a" }), false);
  assert.equal(publication.hasUnpublishedChanges({ kind: "dashboard", published_at: null, content_hash: "b", published_hash: null }), false);
  assert.equal(publication.publicReportPath("11111111-2222-4333-8444-555555555555"), "/report/11111111-2222-4333-8444-555555555555");
  assert.equal(publication.clientPreviewPath("c 1", "d/2"), "/projects/c%201/preview/d%2F2");

  // The stored period uses what the data was collected for when it differs from the configured dates.
  assert.deepEqual(
    publication.reportPeriod(
      { since: "2026-09-01", until: "2026-09-30", compare_since: "2026-08-01", compare_until: "2026-08-31" },
      { effective_period: { since: "2026-09-02", until: "2026-09-21", compare_since: "2026-08-12", compare_until: "2026-09-01" } },
    ),
    { since: "2026-09-02", until: "2026-09-21", compareSince: "2026-08-12", compareUntil: "2026-09-01" },
  );
  assert.deepEqual(
    publication.reportPeriod({ since: "2026-09-01", until: "2026-09-30" }, null),
    { since: "2026-09-01", until: "2026-09-30", compareSince: undefined, compareUntil: undefined },
  );

  // Central rule: sharing (link, PDF, WhatsApp, e-mail) describes the PUBLISHED version
  // and never the editor's state; the private preview is a separate thing.
  const shareMenuSource = fs.readFileSync("components/projects/share-menu.tsx", "utf8");
  assert.doesNotMatch(shareMenuSource, /clientPreviewPath|\/preview\//, "the share menu must not use the private preview");
  assert.doesNotMatch(shareMenuSource, /effective_period|config\.since|config\.until/, "share messages must not read the editor's current period");
  assert.match(shareMenuSource, /published_since/);
  assert.match(shareMenuSource, /\?print=1/, "the shared PDF is the public page opened for printing");
  const publicPageSource = fs.readFileSync("app/report/[token]/page.tsx", "utf8");
  assert.match(publicPageSource, /autoPrint=\{print === "1"\}/);
  const analysisSource = fs.readFileSync("components/projects/analysis-view.tsx", "utf8");
  assert.match(analysisSource, /clientPreviewPath\(doc\.client_id, doc\.id\)/, "'ver como cliente' keeps using the private preview");

  // The client view shows the client's own logo (any https URL) and Meta ad thumbnails; a CSP
  // limited to self/data: silently blocks both.
  const nextConfig = fs.readFileSync("next.config.ts", "utf8");
  assert.match(nextConfig, /"img-src 'self' data: https:"/, "CSP must let https images (client logo, Meta thumbnails) load");
  assert.doesNotMatch(nextConfig, /script-src[^\n]*https:/, "only images were loosened, never scripts");

  // ---- publish / share / revoke lifecycle ---------------------------------------
  const cid = "aecc0000-0000-4000-8000-000000000001";
  const rows = [];
  const db = fakeDocumentsDb(rows);
  const dashboard = db.seed({
    id: "dash-1", client_id: cid, kind: "dashboard", title: "Vendas", status: "draft",
    config: { since: "2026-09-01", until: "2026-09-21", note: "v1" }, data: { current: { spend: 100 } },
    share_token: null, published_snapshot: null, published_at: null, published_hash: null,
  });
  rows.push(dashboard);

  // Sharing before publishing is refused with the user-facing message.
  await assert.rejects(documents.setProjectDocumentShareToken(db, dashboard, true), /Publique este relatório antes de compartilhá-lo/);

  const published = await documents.setProjectDocumentPublication(db, dashboard, true);
  assert.equal(published.status, "published");
  assert.ok(published.published_at);
  assert.equal(published.published_hash, dashboard.content_hash);
  assert.ok(!("published_snapshot" in published), "the snapshot must never be returned to the browser");
  assert.deepEqual(dashboard.published_snapshot, { title: "Vendas", config: { since: "2026-09-01", until: "2026-09-21", note: "v1" }, data: { current: { spend: 100 } } });
  assert.equal(publication.hasUnpublishedChanges(published), false);
  assert.equal(published.published_since, "2026-09-01", "the publication remembers its own period");
  assert.equal(published.published_until, "2026-09-21");

  // The link is created once and then reused: same URL every time.
  const shared = await documents.setProjectDocumentShareToken(db, published, true);
  assert.match(shared.share_token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const updatesBefore = db.calls.length;
  const again = await documents.setProjectDocumentShareToken(db, shared, true);
  assert.equal(again.share_token, shared.share_token);
  assert.equal(db.calls.length, updatesBefore, "asking for the link again must not write anything");

  // Editing without publishing: the live row changes, the snapshot does not.
  db.edit(dashboard, { config: { since: "2026-09-01", until: "2026-09-21", note: "v2 - not published" } });
  const snapshotBefore = JSON.stringify(dashboard.published_snapshot);
  assert.equal(publication.hasUnpublishedChanges({ ...dashboard }), true);
  assert.equal(JSON.stringify(dashboard.published_snapshot), snapshotBefore, "saving must not touch the published snapshot");
  // A period changed in the editor but not published yet must not reach WhatsApp/e-mail/PDF.
  db.edit(dashboard, { config: { since: "2026-10-01", until: "2026-10-31", note: "v2 - not published" } });
  assert.equal(dashboard.published_since, "2026-09-01", "editing never rewrites the published period");
  assert.equal(dashboard.published_until, "2026-09-21");
  db.edit(dashboard, { config: { since: "2026-09-01", until: "2026-09-21", note: "v2 - not published" } });
  assert.equal(dashboard.published_snapshot.config.note, "v1");

  // Publishing again replaces the snapshot but keeps the very same link.
  const republished = await documents.setProjectDocumentPublication(db, { ...dashboard }, true);
  assert.equal(dashboard.published_snapshot.config.note, "v2 - not published");
  assert.equal(republished.share_token, shared.share_token);
  assert.equal(republished.published_since, "2026-09-01");
  assert.equal(publication.hasUnpublishedChanges(republished), false);

  // Publishing needs saved results.
  await assert.rejects(documents.setProjectDocumentPublication(db, { ...dashboard, data: null }, true), /Importe os resultados antes de publicar/);

  // Deactivating the link clears the token; the same request can create a new one.
  const deactivated = await documents.setProjectDocumentShareToken(db, republished, false);
  assert.equal(deactivated.share_token, null);
  assert.equal((await documents.setProjectDocumentShareToken(db, deactivated, false)).share_token, null, "deactivating twice is harmless");
  const fresh = await documents.setProjectDocumentShareToken(db, deactivated, true);
  assert.notEqual(fresh.share_token, shared.share_token);

  // Restricting a dashboard removes the published version (and with it the link's content).
  const restricted = await documents.setProjectDocumentPublication(db, { ...fresh }, false);
  assert.equal(restricted.status, "draft");
  assert.equal(restricted.published_at, null);
  assert.equal(restricted.published_since, null);
  assert.equal(restricted.published_until, null);
  assert.equal(dashboard.published_snapshot, null);
  await assert.rejects(documents.setProjectDocumentShareToken(db, restricted, true), /Publique este relatório antes de compartilhá-lo/);

  // Only dashboards get public links.
  const report = { ...dashboard, id: "rep-1", kind: "report", published_at: "2026-09-01", share_token: null };
  await assert.rejects(documents.setProjectDocumentShareToken(db, report, true), /Apenas dashboards podem gerar link público/);
  await assert.rejects(documents.setProjectDocumentShareToken(db, null, true), /Apenas dashboards/);

  // Token collisions retry with a fresh token instead of failing outright.
  const collidingRows = [
    { id: "a", client_id: cid, kind: "dashboard", status: "published", published_at: "2026-09-01", share_token: null, title: "A", config: {}, data: {}, content_hash: "x" },
  ];
  const collidingDb = fakeDocumentsDb(collidingRows);
  const originalRandomUUID = crypto.randomUUID;
  let attempts = 0;
  collidingRows.push({ id: "other", client_id: cid, kind: "dashboard", share_token: "dup", title: "B", config: {}, data: {}, content_hash: "y" });
  crypto.randomUUID = () => (attempts++ === 0 ? "dup" : originalRandomUUID());
  try {
    const result = await documents.setProjectDocumentShareToken(collidingDb, collidingRows[0], true);
    assert.notEqual(result.share_token, "dup");
    assert.ok(attempts >= 2);
  } finally {
    crypto.randomUUID = originalRandomUUID;
  }

  // ---- public loader ----------------------------------------------------------
  const goodToken = "11111111-2222-4333-8444-555555555555";
  const snapshotRow = {
    title: "Vendas",
    config: { since: "2026-09-01", until: "2026-09-21", comparison: "none", campaign_ids: [], metrics: ["spend"], sections: ["metrics"], subtitle: "Análise de desempenho", analysis: "", template: "sales", primary_metric: "purchases" },
    data: { current: { spend: 100 }, previous: null, daily: [], campaigns: [], adsets: [], ads: [], platforms: [], audience: [], warnings: [], currency: "BRL", timezone: "UTC", updated_at: "2026-09-21T12:00:00Z" },
    updated_at: "2026-09-21T12:00:00Z",
    client_name: "Fresh Burguer",
    client_logo_url: null,
    // Anything extra the database might ever return must not leak through.
    client_id: "must-not-leak", share_token: goodToken, status: "published",
  };
  publicRpc = async (name, params) => {
    assert.equal(name, "get_public_dashboard");
    return params.p_token === goodToken ? { data: snapshotRow, error: null } : { data: null, error: null };
  };
  assert.equal(await reports.loadPublishedReportByToken("not-a-uuid"), null);
  assert.equal(publicClientCalls, 0, "a malformed token must be rejected before touching the database");
  assert.equal(await reports.loadPublishedReportByToken("99999999-2222-4333-8444-555555555555"), null);
  const loaded = await reports.loadPublishedReportByToken(goodToken);
  assert.deepEqual(Object.keys(loaded).sort(), ["clientLogoUrl", "clientName", "config", "data", "title", "updatedAt"]);
  assert.equal(loaded.clientName, "Fresh Burguer");
  publicRpc = async () => ({ data: null, error: { message: "boom" } });
  assert.equal(await reports.loadPublishedReportByToken(goodToken), null, "database errors look exactly like a missing link");

  // ---- private preview loader -------------------------------------------------
  const previewDoc = { id: "d1", client_id: cid, kind: "dashboard", title: "Rascunho", status: "draft", config: snapshotRow.config, data: snapshotRow.data, updated_at: "2026-09-22T10:00:00Z", share_token: null };
  previewRows = [previewDoc];
  const preview = await reports.loadReportPreview(cid, "d1").catch((error) => error);
  assert.ok(preview instanceof ProjectAccessError && preview.status === 404, "ids must be UUIDs");
  const docId = "aecc0000-0000-4000-8000-0000000000d1";
  previewDoc.id = docId;
  const draftPreview = await reports.loadReportPreview(cid, docId);
  assert.equal(draftPreview.title, "Rascunho", "the preview shows the current draft, not the published snapshot");
  assert.equal(draftPreview.clientName, "Fresh Burguer");
  assert.equal(draftPreview.clientLogoUrl, "https://logo.example/f.png");
  assert.deepEqual(Object.keys(draftPreview).sort(), ["clientLogoUrl", "clientName", "config", "data", "title", "updatedAt"]);
  previewDoc.kind = "report";
  await assert.rejects(reports.loadReportPreview(cid, docId), /Apenas dashboards/);
  previewDoc.kind = "dashboard";
  previewDoc.data = null;
  await assert.rejects(reports.loadReportPreview(cid, docId), /Atualize os dados/);

  console.log("PASS: link público estável, snapshot de publicação, rascunho isolado do cliente, revogação e mensagens de WhatsApp/e-mail");
}

main().finally(() => {
  Module._resolveFilename = originalResolve;
  Module._load = originalLoad;
  fs.rmSync(dir, { recursive: true, force: true });
});
