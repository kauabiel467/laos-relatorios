const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-project-setup-test-"));
const originalResolve = Module._resolveFilename;

try {
  const source = "lib/projects/config.ts";
  const output = path.join(dir, "lib/projects/config.js");
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

  const zodPath = require.resolve("zod");
  Module._resolveFilename = function (request, ...args) {
    if (request === "zod") return zodPath;
    if (request.startsWith("@/")) return path.join(dir, request.slice(2) + ".js");
    return originalResolve.call(this, request, ...args);
  };

  const config = require(output);
  const valid = {
    ...config.DEFAULT_PROJECT_DETAILS,
    name: "  Los Burguer  ",
    segment: "  Restaurante / Delivery  ",
    unit: "  Unidade Centro  ",
    contact_email: "  CLIENTE@EXAMPLE.COM  ",
    logo_url: "  https://cdn.example.com/logo.png  ",
  };

  const parsed = config.projectDetailsSchema.parse(valid);
  assert.equal(parsed.name, "Los Burguer");
  assert.equal(parsed.segment, "Restaurante / Delivery");
  assert.equal(parsed.unit, "Unidade Centro");
  assert.equal(parsed.contact_email, "CLIENTE@EXAMPLE.COM");
  assert.equal(parsed.logo_url, "https://cdn.example.com/logo.png");

  assert.equal(
    config.projectCreateSchema.safeParse({
      ...valid,
      team_id: "aebb0000-0000-4000-8000-000000000001",
    }).success,
    true,
    "a configuração completa deve ser aceita pelo mesmo schema do cliente e do servidor",
  );

  const invalidCases = [
    [{ ...valid, name: "x" }, "nome curto"],
    [{ ...valid, segment: "" }, "segmento vazio"],
    [{ ...valid, unit: "" }, "unidade vazia"],
    [{ ...valid, contact_email: "cliente-sem-dominio" }, "e-mail inválido"],
    [{ ...valid, logo_url: "http://example.com/logo.png" }, "logo sem HTTPS"],
    [{ ...valid, language: "fr-FR" }, "idioma fora do catálogo"],
    [{ ...valid, currency: "BTC" }, "moeda fora do catálogo"],
    [{ ...valid, date_format: "DD-MM-YYYY" }, "formato de data fora do catálogo"],
    [{ ...valid, timezone: "Mars/Olympus" }, "fuso fora do catálogo"],
    [{ ...valid, decimal_separator: ",", thousands_separator: "," }, "separadores iguais"],
  ];
  for (const [value, label] of invalidCases) {
    assert.equal(config.projectDetailsSchema.safeParse(value).success, false, label);
  }
  assert.equal(
    config.projectCreateSchema.safeParse({ ...valid, team_id: "equipe-invalida" }).success,
    false,
    "o servidor não deve aceitar um identificador de equipe inválido",
  );
  assert.equal(
    config.projectDetailsSchema.safeParse({
      ...valid,
      contact_email: "",
      logo_url: "",
    }).success,
    true,
    "contato e logo permanecem opcionais sem depender de placeholder",
  );

  const form = new FormData();
  for (const [key, value] of Object.entries(valid)) form.set(key, String(value));
  assert.deepEqual(config.projectDetailsFromForm(form), valid);

  assert.deepEqual(config.INTEGRATION_STATUS_LABELS, {
    available: "Disponível",
    connected: "Conectado",
    beta: "Beta",
    soon: "Em breve",
    unavailable: "Indisponível",
  });
  const connectable = config.PROJECT_INTEGRATIONS.filter((item) => item.connectable);
  assert.deepEqual(
    connectable.map((item) => item.id),
    ["meta"],
    "apenas integrações realmente implementadas podem oferecer conexão",
  );
  const meta = config.PROJECT_INTEGRATIONS.find((item) => item.id === "meta");
  assert.equal(meta.availability, "available");
  assert.equal(meta.maturity, "beta");
  for (const integration of config.PROJECT_INTEGRATIONS.filter((item) => item.id !== "meta")) {
    assert.equal(integration.connectable, false, `${integration.name} não pode exibir controle de conexão`);
    assert.notEqual(integration.availability, "connected", `${integration.name} não pode fingir conexão`);
    assert.notEqual(integration.availability, "available", `${integration.name} não pode fingir disponibilidade`);
    assert.ok(integration.note.length > 20, `${integration.name} precisa explicar a dependência real`);
  }
  assert.equal(config.PROJECT_INTEGRATIONS.find((item) => item.id === "ifood").availability, "unavailable");
  assert.equal(config.PROJECT_INTEGRATIONS.find((item) => item.id === "cardapio").availability, "unavailable");

  const detailsComponent = fs.readFileSync("components/projects/project-details-fields.tsx", "utf8");
  for (const field of [
    "name",
    "segment",
    "unit",
    "contact_email",
    "logo_url",
    "language",
    "currency",
    "date_format",
    "decimal_separator",
    "thousands_separator",
    "timezone",
  ]) {
    assert.match(detailsComponent, new RegExp(`(?:htmlFor|name)=\\"${field}\\"`), `${field} precisa de identificação visível`);
  }
  assert.doesNotMatch(
    detailsComponent,
    /aria-label=\"(?:Nome|Segmento|Unidade|Contato|Logo|Idioma|Moeda|Formato|Separador|Fuso)/,
    "os campos principais devem usar labels visíveis, não somente aria-label",
  );

  const apiSource = fs.readFileSync("app/api/projects/route.ts", "utf8");
  assert.match(apiSource, /projectDetailsSchema\.parse\(/, "a rota deve repetir a validação no servidor");
  assert.match(apiSource, /projectCreateSchema\.parse\(/, "a criação deve ser validada no servidor");

  const migration = fs.readFileSync("supabase/migrations/007_project_configuration_workflow.sql", "utf8");
  for (const column of [
    "language",
    "currency",
    "date_format",
    "decimal_separator",
    "thousands_separator",
    "timezone",
    "onboarding_step",
    "onboarding_completed_at",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`), `${column} precisa ser persistido`);
  }
  for (const procedure of [
    "agency_grant_access",
    "agency_accept_client_invitations",
    "agency_revoke_access",
    "agency_revoke_invitation",
  ]) {
    assert.match(migration, new RegExp(`(?:create|create or replace) function public\\.${procedure}\\(`));
  }
  assert.match(migration, /alter table public\.agency_client_invitations enable row level security/);
  assert.match(migration, /role text not null default 'viewer' check \(role = 'viewer'\)/);

  console.log("PASS: validação compartilhada, preferências persistidas, labels e catálogo honesto de integrações");
} finally {
  Module._resolveFilename = originalResolve;
  fs.rmSync(dir, { recursive: true, force: true });
}
