const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Swap one character in the middle of a sealed value for a different one. The old
// "replace the last character with x" was a silent no-op whenever the last
// character already was "x" (or only touched unused base64 padding bits), which
// made the tamper-detection assertions randomly fail.
function tamper(value) {
  const index = Math.floor(value.length / 2);
  return `${value.slice(0, index)}${value[index] === "A" ? "B" : "A"}${value.slice(index + 1)}`;
}


const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-ifood-oauth-test-"));
const originalResolve = Module._resolveFilename;
const previousEnv = {
  clientId: process.env.IFOOD_CLIENT_ID,
  clientSecret: process.env.IFOOD_CLIENT_SECRET,
  stateSecret: process.env.IFOOD_OAUTH_STATE_SECRET,
  tokenSecret: process.env.IFOOD_TOKEN_ENCRYPTION_KEY,
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
    process.env.IFOOD_CLIENT_SECRET = "client-secret-only-on-server";
    process.env.IFOOD_OAUTH_STATE_SECRET = "test-secret-with-more-than-thirty-two-characters";
    process.env.IFOOD_TOKEN_ENCRYPTION_KEY = "different-token-key-with-more-than-thirty-two-characters";
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

    let tokenUrl = "";
    let tokenInit;
    const tokenFixture = {
      accessToken: "ifood-access-token-never-sent-to-browser",
      refreshToken: "ifood-refresh-token-never-sent-to-browser",
      expiresIn: 3600,
      type: "bearer",
    };
    const token = await oauth.requestIfoodAccessToken(
      "authorization-code-from-user",
      fixture.authorizationCodeVerifier,
      async (url, init) => {
        tokenUrl = String(url);
        tokenInit = init;
        return new Response(JSON.stringify(tokenFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    assert.equal(
      tokenUrl,
      "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token",
    );
    assert.equal(tokenInit.method, "POST");
    assert.equal(tokenInit.body.get("grantType"), "authorization_code");
    assert.equal(tokenInit.body.get("clientId"), "client-id-only-on-server");
    assert.equal(tokenInit.body.get("clientSecret"), "client-secret-only-on-server");
    assert.equal(tokenInit.body.get("authorizationCode"), "authorization-code-from-user");
    assert.equal(
      tokenInit.body.get("authorizationCodeVerifier"),
      fixture.authorizationCodeVerifier,
    );
    assert.equal(tokenInit.body.size, 5);
    assert.deepEqual(token, tokenFixture);

    const sealedAccessToken = oauth.sealIfoodCredential(token.accessToken);
    assert.doesNotMatch(sealedAccessToken, /ifood-access-token/);
    assert.equal(oauth.unsealIfoodCredential(sealedAccessToken), token.accessToken);
    assert.throws(
      () => oauth.unsealIfoodCredential(tamper(sealedAccessToken)),
      /credenciais armazenadas.*inválidas/i,
    );

    await assert.rejects(
      () => oauth.requestIfoodAccessToken(
        "expired-code",
        fixture.authorizationCodeVerifier,
        async () => new Response(
          JSON.stringify({ error: "invalid_grant", error_description: "authorization code expired" }),
          { status: 400 },
        ),
      ),
      (error) => error.code === "authorization_code_expired",
    );
    await assert.rejects(
      () => oauth.requestIfoodAccessToken(
        "invalid-code",
        fixture.authorizationCodeVerifier,
        async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
      ),
      (error) => error.code === "invalid_authorization_code",
    );

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
      () => oauth.unsealIfoodOAuthState(tamper(sealed)),
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

    const completeRoute = fs.readFileSync(
      "app/api/integrations/ifood/complete/route.ts",
      "utf8",
    );
    assert.match(completeRoute, /authorizationCodeVerifier: state\.authorizationCodeVerifier/);
    assert.match(completeRoute, /state\.userId !== user\.id \|\| state\.projectId !== input\.projectId/);
    assert.match(completeRoute, /\{ connection \}/, "o navegador recebe somente o resumo da conexão");
    assert.doesNotMatch(
      completeRoute,
      /NextResponse\.json\([^)]*(?:accessToken|refreshToken|clientSecret)/s,
      "tokens e client secret nunca podem entrar na resposta pública",
    );

    const storage = fs.readFileSync("lib/projects/ifood.ts", "utf8");
    assert.match(storage, /access_token_ciphertext: sealIfoodCredential\(token\.accessToken\)/);
    assert.match(storage, /refresh_token_ciphertext: sealIfoodCredential\(token\.refreshToken\)/);
    assert.match(storage, /connection_already_exists/);

    const migration = fs.readFileSync(
      "supabase/migrations/20260922144219_agency_ifood_connections.sql",
      "utf8",
    );
    assert.match(migration, /alter table public\.agency_ifood_connections enable row level security/i);
    assert.match(migration, /revoke all on table public\.agency_ifood_connections from public, anon, authenticated/i);
    assert.match(migration, /grant all on table public\.agency_ifood_connections to service_role/i);
    assert.match(migration, /access_token_ciphertext text/i);
    assert.match(migration, /refresh_token_ciphertext text/i);

    const component = fs.readFileSync("components/projects/project-integrations.tsx", "utf8");
    assert.match(component, /Conectar iFood/);
    assert.match(component, /title="Integrar iFood"/);
    assert.match(component, /verificationUrlComplete \?\? ifoodCode\.verificationUrl/);
    assert.match(component, /Código de autorização/);
    assert.match(component, /Concluir integração/);
    assert.match(component, /iFood conectado/);

    console.log("PASS: OAuth distribuído iFood troca tokens no servidor e persiste somente credenciais cifradas");
  } finally {
    Module._resolveFilename = originalResolve;
    if (previousEnv.clientId === undefined) delete process.env.IFOOD_CLIENT_ID;
    else process.env.IFOOD_CLIENT_ID = previousEnv.clientId;
    if (previousEnv.clientSecret === undefined) delete process.env.IFOOD_CLIENT_SECRET;
    else process.env.IFOOD_CLIENT_SECRET = previousEnv.clientSecret;
    if (previousEnv.stateSecret === undefined) delete process.env.IFOOD_OAUTH_STATE_SECRET;
    else process.env.IFOOD_OAUTH_STATE_SECRET = previousEnv.stateSecret;
    if (previousEnv.tokenSecret === undefined) delete process.env.IFOOD_TOKEN_ENCRYPTION_KEY;
    else process.env.IFOOD_TOKEN_ENCRYPTION_KEY = previousEnv.tokenSecret;
    if (previousEnv.apiBaseUrl === undefined) delete process.env.IFOOD_API_BASE_URL;
    else process.env.IFOOD_API_BASE_URL = previousEnv.apiBaseUrl;
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
