const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-meta-connection-test-"));
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;

async function main() {
  const source = "lib/projects/meta.ts";
  const output = path.join(dir, "lib/projects/meta.js");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    ts.transpileModule(fs.readFileSync(source, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );

  const rpcCalls = [];
  const adminUpdates = [];
  const graphTokens = [];
  const admin = {
    from(table) {
      const state = { table, filters: [] };
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          state.filters.push([key, value]);
          return query;
        },
        update(value) {
          adminUpdates.push({ table, value });
          return query;
        },
        async single() {
          if (table === "meta_integration_sessions") {
            return {
              data: {
                id: "session-row",
                stage: "connected",
                access_token: "provider-access-token",
                accounts: [
                  {
                    id: "act_123",
                    accountId: "123",
                    name: "Conta real",
                    status: "1",
                  },
                ],
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const userDb = {
    async rpc(name, value) {
      rpcCalls.push({ name, value });
      return { data: null, error: null };
    },
  };

  class FakeMetaGraphError extends Error {}
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith("@/")) return path.join(dir, request.slice(2) + ".js");
    return originalResolve.call(this, request, ...args);
  };
  Module._load = function (request, ...args) {
    if (request === "@/lib/supabase/server") {
      return { getSupabaseAdminClient: () => admin };
    }
    if (request === "@/lib/projects/access") {
      return {
        authorizeProject: async () => ({
          db: userDb,
          user: { id: "actor" },
        }),
      };
    }
    if (request === "@/lib/integrations/meta-oauth") {
      return {
        requireMetaUser: async () => "actor",
        readMetaSessionToken: async () => "browser-session-token",
      };
    }
    if (request === "@/lib/integrations/meta-graph") {
      return {
        MetaGraphError: FakeMetaGraphError,
        fetchGraph: async (endpoint, _params, token) => {
          graphTokens.push({ endpoint, token });
          return endpoint.endsWith("/insights")
            ? { data: [] }
            : {
                id: "act_123",
                name: "Conta real",
                account_status: 1,
                currency: "BRL",
                timezone_name: "America/Sao_Paulo",
              };
        },
      };
    }
    if (request === "@/lib/metrics/engine") return { metaMetrics: () => ({}) };
    if (request === "@/lib/metrics/dates") return { resolvePeriod: () => ({}) };
    if (request === "@/lib/metrics/catalog") return { METRICS: {} };
    if (request === "@/lib/metrics/meta-adapters") {
      return { adaptModernMeta: () => ({}) };
    }
    return originalLoad.call(this, request, ...args);
  };

  const meta = require(output);
  const result = await meta.bindProjectMeta(
    "aecc0000-0000-4000-8000-000000000001",
    "act_123",
  );

  assert.equal(result.connection_status, "connected");
  assert.equal(graphTokens.length, 2, "o vínculo deve testar conta e Insights");
  assert.ok(
    graphTokens.every((call) => call.token === "provider-access-token"),
    "o teste deve usar o access token protegido, nunca o token da sessão do navegador",
  );
  assert.deepEqual(rpcCalls, [
    {
      name: "agency_bind_meta_connection",
      value: {
        cid: "aecc0000-0000-4000-8000-000000000001",
        target_session_id: "session-row",
        target_account_id: "act_123",
      },
    },
  ]);
  assert.equal(
    adminUpdates.at(-1).value.connection_status,
    "connected",
    "somente a atualização server-side deve confirmar a saúde",
  );

  const migration = fs.readFileSync(
    "supabase/migrations/007_project_configuration_workflow.sql",
    "utf8",
  );
  assert.match(
    migration,
    /account_metadata ->> 'status',\s*'untested', null, null, null, null/,
    "a RPC pública deve persistir o vínculo como não testado",
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.agency_bind_meta_connection\([\s\S]*?checked_at timestamptz/,
    "a RPC pública não deve aceitar saúde ou horário informados pelo cliente",
  );

  console.log(
    "PASS: vínculo Meta usa o token do provedor e confirmação de saúde server-side",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._resolveFilename = originalResolve;
    Module._load = originalLoad;
    fs.rmSync(dir, { recursive: true, force: true });
  });
