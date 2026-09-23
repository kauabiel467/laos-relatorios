const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-architecture-test-"));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let sessionDb;
let adminDb = null;
let collectionCalls = 0;
const collected = { current: { spend: 12 }, updated_at: "2026-09-01T12:00:00Z" };

function database({ client, role, user = { id: "actor", email: "actor@example.invalid" }, document = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      const call = { table, filters: [], action: "read" };
      calls.push(call);
      const query = {
        select() { return query; },
        order() { return query; },
        limit() { return query; },
        or(value) { call.or = value; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        insert(value) { call.action = "insert"; call.value = value; return query; },
        update(value) { call.action = "update"; call.value = value; return query; },
        delete() { call.action = "delete"; return query; },
        result() {
          const data = table === "agency_clients" ? client ?? null
            : table === "team_members" ? role ? { role } : null
              : call.action === "read" ? document : { id: "copy", ...call.value };
          return { data, error: null };
        },
        async maybeSingle() { return query.result(); },
        async single() { return query.result(); },
        then(resolve, reject) { return Promise.resolve(query.result()).then(resolve, reject); },
      };
      return query;
    },
  };
}

function teamDatabase() {
  const calls = [];
  const tables = {
    team_members: [
      { id: "member-a", team_id: "team-a", user_id: "actor", role: "owner" },
      { id: "member-b", team_id: "team-b", user_id: "actor", role: "manager" },
    ],
    teams: [{ id: "team-a", name: "Agency A" }, { id: "team-b", name: "Agency B" }],
    team_invitations: [],
  };
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: "actor", email: "actor@example.invalid" } } }) },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const result = () => ({ data: (tables[table] ?? []).filter((row) => call.filters.every(([key, value]) => row[key] === value)), error: null });
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        upsert(value) { call.value = value; return query; },
        async maybeSingle() { return { ...result(), data: result().data[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
}

async function main() {
  for (const file of [
    ...["catalog", "meta-events", "engine", "dates"].map((name) => `lib/metrics/${name}.ts`),
    ...["model", "routes", "publication", "access", "documents"].map((name) => `lib/projects/${name}.ts`),
    "lib/auth-invitations.ts",
    "lib/team/server.ts",
    "lib/integrations/meta-graph.ts",
  ]) {
    const output = path.join(dir, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith("@/")) return path.join(dir, request.slice(2) + ".js");
    return originalResolve.call(this, request, ...args);
  };
  Module._load = function (request, ...args) {
    if (request === "@/lib/supabase/server") return { getSupabaseServerClient: async () => sessionDb, getSupabaseAdminClient: () => adminDb };
    if (request === "@/lib/env") return { env: { NEXT_PUBLIC_APP_URL: "https://laos.example.invalid" } };
    if (request === "@/lib/projects/meta") return { collectAnalysis: async () => { collectionCalls++; return collected; } };
    return originalLoad.call(this, request, ...args);
  };
  const routes = require(path.join(dir, "lib/projects/routes.js"));
  const access = require(path.join(dir, "lib/projects/access.js"));
  const documents = require(path.join(dir, "lib/projects/documents.js"));
  const model = require(path.join(dir, "lib/projects/model.js"));
  const team = require(path.join(dir, "lib/team/server.js"));
  const graph = require(path.join(dir, "lib/integrations/meta-graph.js"));
  const cid = "aecc0000-0000-4000-8000-000000000001";
  const client = { id: cid, team_id: "team" };
  assert.equal(routes.legacyRootHref({}), "/projects");
  assert.equal(routes.legacyRootHref({ view: "overview" }), "/overview");
  assert.equal(routes.legacyRootHref({ view: "templates" }), "/templates");
  assert.equal(routes.workspaceHref("team"), "/team/settings");
  assert.equal(routes.workspaceHref("team", { teamId: "team-b" }), "/team/settings?team=team-b");
  for (const section of routes.PROJECT_SECTIONS) {
    assert.equal(routes.projectHref(cid, section), `/projects/${cid}${section === "overview" ? "" : `/${section}`}`);
  }
  assert.equal(routes.isProjectSection("unknown"), false);
  assert.equal(routes.projectHref("//example.invalid?x=1"), "/projects/%2F%2Fexample.invalid%3Fx%3D1");
  const migrated = new URL(routes.legacyRootHref({ project: cid, document: "doc", preview: "1", view: "integrations", meta: "error", reason: "permission" }), "https://laos.example.invalid");
  assert.equal(migrated.pathname, `/projects/${cid}/integrations`);
  assert.equal(migrated.searchParams.get("document"), "doc");
  assert.equal(migrated.searchParams.get("preview"), "1");
  assert.equal(migrated.searchParams.get("meta"), "error");
  for (const section of ["reports", "goals", "timeline", "integrations", "settings"]) {
    assert.equal(routes.legacyOperationsHref({ client: cid, view: section }), `/projects/${cid}/${section}`);
  }
  assert.equal(routes.legacyOperationsHref({ client: cid, view: "automations" }), `/projects/${cid}`);
  assert.equal(routes.legacyOperationsHref({ view: "settings" }), "/team/settings");

  sessionDb = database({ user: null });
  await assert.rejects(access.authorizeProject(cid), (error) => error.status === 401);
  sessionDb = database();
  await assert.rejects(access.authorizeProject(cid), (error) => error.status === 404);
  sessionDb = database({ client });
  assert.equal((await access.projectAccess(cid)).role, undefined);
  await assert.rejects(access.authorizeProject(cid), (error) => error.status === 403);
  sessionDb = database({ client, role: "operator" });
  assert.equal((await access.authorizeProject(cid)).role, "operator");
  await assert.rejects(access.authorizeProject(cid, true), (error) => error.status === 403);
  sessionDb = database({ client, role: "owner" });
  assert.equal((await access.authorizeProject(cid, true)).role, "owner");
  assert.deepEqual(sessionDb.calls[0].filters, [["id", cid]]);
  assert.deepEqual(sessionDb.calls[1].filters, [["team_id", "team"], ["user_id", "actor"]]);
  sessionDb = teamDatabase();
  const selectedTeam = await team.getTeamContext("team-b");
  assert.equal(selectedTeam.team.id, "team-b");
  assert.equal(selectedTeam.currentRole, "manager");
  assert.equal(selectedTeam.members[0].team_id, "team-b");
  const inaccessibleTeam = await team.getTeamContext("other-team");
  assert.equal(inaccessibleTeam.team, null);
  assert.deepEqual(inaccessibleTeam.members, []);
  await assert.rejects(team.inviteTeamMember("invite@example.invalid", "operator", "other-team"), /permissao/);
  await assert.rejects(team.inviteTeamMember("invite@example.invalid", "owner", "team-b"), /apenas operadores/);
  adminDb = { auth: { admin: { inviteUserByEmail: async () => ({ error: { message: "email rate limit exceeded" } }) } } };
  const failedDelivery = await team.inviteTeamMember("invite@example.invalid", "operator", "team-a");
  assert.equal(failedDelivery.emailSent, false, "a provider error cannot be reported as a sent invitation");
  assert.equal(sessionDb.calls.at(-1).value.team_id, "team-a", "invitations use the selected workspace");
  adminDb = null;

  const draft = { id: "doc", client_id: cid, kind: "dashboard", status: "draft", title: "Documento", config: model.defaultConfig("messages"), data: { current: { spend: 10 } } };
  const immutable = { ...draft, kind: "report", status: "published" };
  const db = database();
  await assert.rejects(documents.saveProjectDocument(db, cid, "actor", { action: "save", title: "Changed", config: draft.config, kind: "report" }, immutable), /publicado/);
  await assert.rejects(documents.deleteProjectDocument(db, immutable), /rascunhos/);
  await assert.rejects(documents.setProjectDocumentPublication(db, immutable, false), /preservados/);
  assert.equal(db.calls.length, 0, "immutable reports cannot reach a mutation query");
  await documents.copyProjectDocument(db, immutable, "actor", "template");
  assert.equal(db.calls.at(-1).value.kind, "template");
  assert.equal(db.calls.at(-1).value.data, null);
  await documents.copyProjectDocument(db, draft, "actor", "convert");
  assert.equal(db.calls.at(-1).value.kind, "report");
  assert.equal(db.calls.at(-1).value.data, draft.data);
  assert.equal(draft.kind, "dashboard", "conversion preserves the source dashboard");
  await documents.saveProjectDocument(db, cid, "actor", { action: "save", title: draft.title, config: draft.config, kind: draft.kind }, draft);
  assert.equal(db.calls.at(-1).value.data, draft.data);
  await documents.saveProjectDocument(db, cid, "actor", { action: "save", title: draft.title, config: { ...draft.config, campaign_ids: ["campaign"] }, kind: draft.kind }, draft);
  assert.equal(db.calls.at(-1).value.data, null);
  assert.equal(db.calls.at(-1).value.status, "draft");
  assert.equal(collectionCalls, 0);
  await documents.saveProjectDocument(db, cid, "actor", { action: "refresh", title: draft.title, config: draft.config, kind: draft.kind }, draft);
  assert.equal(collectionCalls, 1);
  assert.equal(db.calls.at(-1).value.data, collected);
  await assert.rejects(documents.getProjectDocument(db, cid, "missing"), (error) => error.status === 404);
  assert.deepEqual(db.calls.at(-1).filters, [["id", "missing"], ["client_id", cid]]);
  await assert.rejects(documents.getPreservedReport(db, cid, "missing"), (error) => error.status === 404);
  assert.deepEqual(db.calls.at(-1).filters, [["id", "missing"], ["client_id", cid], ["kind", "report"]]);
  const historical = { id: "legacy", kind: "report", payload: { original: true }, status: "published" };
  assert.equal(documents.preservedLegacyReports([historical, { kind: "goal" }])[0], historical, "legacy snapshots are not rewritten");
  assert.match(fs.readFileSync("app/api/agency/route.ts", "utf8"), /export \{ GET, POST \} from "@\/app\/api\/projects\/route"/);
  assert.doesNotMatch(fs.readFileSync("app/api/projects/route.ts", "utf8"), /from\("agency_documents"\)/);
  for (const file of ["app/api/meta/dashboard/route.ts", "app/api/meta/campaign-ads/route.ts"]) assert.match(fs.readFileSync(file, "utf8"), /status: 410/);
  assert.equal(fs.existsSync("components/dashboard/dashboard-app.tsx"), false);
  assert.equal(fs.existsSync("components/agency/workspace.tsx"), false);
  const originalFetch = global.fetch;
  try {
    const requests = [];
    global.fetch = async (url) => {
      requests.push(new URL(url));
      return { ok: true, text: async () => JSON.stringify(requests.length === 1
        ? { data: [{ id: "one" }], paging: { next: "present", cursors: { after: "cursor" } } }
        : { data: [{ id: "two" }] }) };
    };
    assert.deepEqual((await graph.fetchGraph("act_1/insights", { fields: "spend" }, "fixture-token")).data, [{ id: "one" }, { id: "two" }]);
    assert.equal(requests[1].searchParams.get("after"), "cursor");
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ data: [], paging: { next: "present" } }) });
    await assert.rejects(graph.fetchGraph("act_1/insights", {}, "fixture-token"), /cursor/);
    global.fetch = async () => ({
      ok: false,
      text: async () => JSON.stringify({ error: { message: "Temporary Meta error", code: 2, type: "OAuthException", is_transient: true } }),
    });
    await assert.rejects(
      graph.fetchGraph("act_1/insights", {}, "fixture-token"),
      (error) => error instanceof graph.MetaGraphError
        && error.message === "Temporary Meta error"
        && error.code === 2
        && error.type === "OAuthException"
        && error.transient === true,
    );
    global.fetch = async () => ({ ok: true, text: async () => "not-json" });
    await assert.rejects(graph.fetchGraph("act_1/insights", {}, "fixture-token"), /formato inesperado/);
  } finally { global.fetch = originalFetch; }
  console.log("PASS: canonical routes, legacy redirects, shared authorization, document snapshots, immutability and retired parallel paths");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  Module._resolveFilename = originalResolve;
  Module._load = originalLoad;
  fs.rmSync(dir, { recursive: true, force: true });
});
