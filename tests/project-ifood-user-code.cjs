const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-ifood-oauth-test-"));
const originalResolve = Module._resolveFilename;
const previousEnv = {
  clientId: process.env.IFOOD_CLIENT_ID,
  stateSecret: process.env.IFOOD_OAUTH_STATE_SECRET,
  apiBaseUrl: process.env.IFOOD_API_BASE_URL,
};

function compile(source) {
  const output = path.join(dir, source.replace(/\.ts$/, ".js"));
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
  return output;
}

(async () => {
  try {
    process.env.IFOOD_CLIENT_ID = "client-id-only-on-server";
    process.env.IFOOD_OAUTH_STATE_SECRET = "test-secret-with-more-than-thirty-two-characters";
    delete process.env.IFOOD_API_BASE_URL;

    const envOutput = compile("lib/env.ts");
    const oauthOutput = compile("lib/integrations/ifood-oauth.ts");
    const zodPath = require.resolve("zod");
    Module._resolveFilename = function (request, ...args) {
      if (request === "zod") return zodPath;
      if (request === "@/lib/env") return envOutput;
      return originalResolve.call(this, request, ...args);
    };

    const oauth = require(oauthOutput);
    let capturedUrl = "";
    let capturedInit;
    const fixture = {
      userCode: "ABCD-EFGH",
      authorizationCodeVerifier: "verifier-returned-only-to-the-server",
      verificationUrl: "https://portal.ifood.com.br/apps/code",
      verificationUrlComplete: "https://portal.ifood.com.br/apps/code?c=ABCD-EFGH",
      expiresIn: 600,
    };
    const result = await oauth.requestIfoodUserCode(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    assert.equal(
      capturedUrl,
      "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/userCode",
      "deve usar o endpoint oficial de userCode",
    );
    assert.equal(capturedInit.method, "POST");
    assert.equal(capturedInit.headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(capturedInit.body.get("clientId"), "client-id-only-on-server");
    assert.equal(capturedInit.body.size, 1, "nenhum secret deve ser enviado para gerar o código");
    assert.deepEqual(result, fixture);

    const now = Date.now();
    const state = {
      version: 1,
      userId: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      authorizationCodeVerifier: fixture.authorizationCodeVerifier,
      issuedAt: now,
      expiresAt: now + 600_000,
    };
    const sealed = oauth.sealIfoodOAuthState(state);
    assert.doesNotMatch(sealed, /verifier-returned-only-to-the-server/);
    assert.doesNotMatch(sealed, /11111111-1111/);
    assert.deepEqual(oauth.unsealIfoodOAuthState(sealed), state);
    assert.throws(
      () => oauth.unsealIfoodOAuthState(`${sealed.slice(0, -1)}x`),
      /Estado de autorização inválido/,
      "estado adulterado deve ser rejeitado",
    );

    assert.throws(
      () => oauth.parseIfoodUserCodeResponse({
        ...fixture,
        verificationUrlComplete: "https://example.com/phishing",
      }),
      /URL de autorização inválida/,
      "somente o Portal do Parceiro oficial pode ser aberto",
    );

    const route = fs.readFileSync("app/api/integrations/ifood/user-code/route.ts", "utf8");
    assert.match(route, /authorizeProject\(input\.projectId\)/, "a rota precisa validar acesso ao projeto");
    assert.match(route, /authorizationCodeVerifier: result\.authorizationCodeVerifier/, "o verifier deve entrar no estado cifrado");
    const publicPayload = route.match(/NextResponse\.json\(\{([\s\S]*?)\}\);/);
    assert.ok(publicPayload, "a resposta pública deve ser explícita");
    assert.doesNotMatch(
      publicPayload[1],
      /authorizationCodeVerifier|clientId|state,/,
      "a resposta ao navegador não pode expor credencial ou verifier",
    );
    assert.match(route, /Cache-Control", "private, no-store, max-age=0"/);
    const cookieOptions = oauth.getIfoodOAuthCookieOptions(600);
    assert.equal(cookieOptions.httpOnly, true);
    assert.equal(cookieOptions.sameSite, "lax");
    assert.equal(cookieOptions.path, "/api/integrations/ifood");
    assert.equal(cookieOptions.maxAge, 600);

    const component = fs.readFileSync("components/projects/project-integrations.tsx", "utf8");
    assert.match(component, /Conectar iFood/);
    assert.match(component, /title="Integrar iFood"/);
    assert.match(component, /verificationUrlComplete \?\? ifoodCode\.verificationUrl/);
    assert.match(component, /A troca por token será habilitada na próxima etapa/);

    console.log("PASS: início do OAuth iFood usa endpoint oficial, estado cifrado e resposta pública mínima");
  } finally {
    Module._resolveFilename = originalResolve;
    if (previousEnv.clientId === undefined) delete process.env.IFOOD_CLIENT_ID;
    else process.env.IFOOD_CLIENT_ID = previousEnv.clientId;
    if (previousEnv.stateSecret === undefined) delete process.env.IFOOD_OAUTH_STATE_SECRET;
    else process.env.IFOOD_OAUTH_STATE_SECRET = previousEnv.stateSecret;
    if (previousEnv.apiBaseUrl === undefined) delete process.env.IFOOD_API_BASE_URL;
    else process.env.IFOOD_API_BASE_URL = previousEnv.apiBaseUrl;
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
