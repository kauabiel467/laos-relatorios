import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";

export const IFOOD_OAUTH_STATE_COOKIE = "laos_ifood_oauth_state";
export const IFOOD_API_ORIGIN = "https://merchant-api.ifood.com.br";

const userCodeResponseSchema = z.object({
  userCode: z.string().trim().min(1).max(100),
  authorizationCodeVerifier: z.string().min(1).max(2048),
  verificationUrl: z.string().url(),
  verificationUrlComplete: z.string().url().optional().nullable(),
  expiresIn: z.coerce.number().int().positive().max(3600),
});

const tokenResponseSchema = z.object({
  accessToken: z.string().min(1).max(8192),
  refreshToken: z.string().min(1).max(8192),
  expiresIn: z.coerce.number().int().positive().max(31_536_000),
  type: z.string().min(1).max(80).optional(),
});

const oauthStateSchema = z.object({
  version: z.literal(1),
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  authorizationCodeVerifier: z.string().min(1).max(2048),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export type IfoodOAuthState = z.infer<typeof oauthStateSchema>;
export type IfoodUserCodeResponse = z.infer<typeof userCodeResponseSchema>;
export type IfoodTokenResponse = z.infer<typeof tokenResponseSchema>;

export class IfoodOAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 409 | 429 | 502 | 503,
    public readonly code: string,
  ) {
    super(message);
    this.name = "IfoodOAuthError";
  }
}

function encryptionKey(secret: string | undefined, code: string) {
  if (!secret || secret.length < 32) {
    throw new IfoodOAuthError(
      "A integração iFood ainda não foi configurada pelo administrador.",
      503,
      code,
    );
  }
  return createHash("sha256").update(secret).digest();
}

function oauthSecret(secret = env.IFOOD_OAUTH_STATE_SECRET) {
  return encryptionKey(secret, "missing_state_secret");
}

function sealValue(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function unsealValue(value: string, key: Buffer) {
  const [version, encodedIv, encodedTag, encodedPayload] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedPayload) {
    throw Error("invalid_encrypted_value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedPayload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function trustedPortalUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "portal.ifood.com.br";
}

export function parseIfoodUserCodeResponse(value: unknown): IfoodUserCodeResponse {
  const parsed = userCodeResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new IfoodOAuthError(
      "O iFood retornou uma resposta incompleta. Tente gerar outro código.",
      502,
      "invalid_ifood_response",
    );
  }
  if (
    !trustedPortalUrl(parsed.data.verificationUrl) ||
    (parsed.data.verificationUrlComplete &&
      !trustedPortalUrl(parsed.data.verificationUrlComplete))
  ) {
    throw new IfoodOAuthError(
      "O iFood retornou uma URL de autorização inválida.",
      502,
      "invalid_verification_url",
    );
  }
  return parsed.data;
}

export async function requestIfoodUserCode(
  fetcher: typeof fetch = fetch,
): Promise<IfoodUserCodeResponse> {
  if (!env.IFOOD_CLIENT_ID) {
    throw new IfoodOAuthError(
      "A integração iFood ainda não foi configurada pelo administrador.",
      503,
      "missing_client_id",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher(
      `${env.IFOOD_API_BASE_URL ?? IFOOD_API_ORIGIN}/authentication/v1.0/oauth/userCode`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ clientId: env.IFOOD_CLIENT_ID }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new IfoodOAuthError(
          "O iFood recusou as credenciais da aplicação. Revise a configuração.",
          response.status,
          "ifood_credentials_rejected",
        );
      }
      if (response.status === 429) {
        throw new IfoodOAuthError(
          "O limite temporário do iFood foi atingido. Aguarde e tente novamente.",
          429,
          "ifood_rate_limited",
        );
      }
      throw new IfoodOAuthError(
        "O iFood não conseguiu gerar o código agora. Tente novamente em instantes.",
        502,
        "ifood_request_failed",
      );
    }
    return parseIfoodUserCodeResponse(payload);
  } catch (error) {
    if (error instanceof IfoodOAuthError) throw error;
    throw new IfoodOAuthError(
      "Não foi possível contatar o iFood. Verifique sua conexão e tente novamente.",
      502,
      "ifood_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function providerErrorText(payload: unknown, raw: string) {
  if (!payload || typeof payload !== "object") return raw;
  const record = payload as Record<string, unknown>;
  return [record.error, record.error_description, record.message, record.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export async function requestIfoodAccessToken(
  authorizationCode: string,
  authorizationCodeVerifier: string,
  fetcher: typeof fetch = fetch,
): Promise<IfoodTokenResponse> {
  if (!env.IFOOD_CLIENT_ID || !env.IFOOD_CLIENT_SECRET) {
    throw new IfoodOAuthError(
      "A autenticação do iFood ainda não foi configurada pelo administrador.",
      503,
      "missing_client_credentials",
    );
  }
  // Fail before consuming the one-time authorization code when secure token
  // storage is not configured.
  encryptionKey(env.IFOOD_TOKEN_ENCRYPTION_KEY, "missing_token_encryption_key");
  if (env.IFOOD_TOKEN_ENCRYPTION_KEY === env.IFOOD_OAUTH_STATE_SECRET) {
    throw new IfoodOAuthError(
      "Use chaves distintas para o estado OAuth e para os tokens do iFood.",
      503,
      "insecure_token_encryption_key",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher(
      `${env.IFOOD_API_BASE_URL ?? IFOOD_API_ORIGIN}/authentication/v1.0/oauth/token`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grantType: "authorization_code",
          clientId: env.IFOOD_CLIENT_ID,
          clientSecret: env.IFOOD_CLIENT_SECRET,
          authorizationCode,
          authorizationCodeVerifier,
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = providerErrorText(payload, raw).toLocaleLowerCase("en-US");
      if (response.status === 400 && details.includes("expir")) {
        throw new IfoodOAuthError(
          "O código de autorização expirou. Gere um novo código de vinculação.",
          400,
          "authorization_code_expired",
        );
      }
      if (response.status === 400) {
        throw new IfoodOAuthError(
          "O código de autorização é inválido. Confira o código e tente novamente.",
          400,
          "invalid_authorization_code",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new IfoodOAuthError(
          "O iFood recusou a autenticação da aplicação. Revise as credenciais configuradas.",
          502,
          "ifood_authentication_failed",
        );
      }
      if (response.status === 429) {
        throw new IfoodOAuthError(
          "O limite temporário do iFood foi atingido. Aguarde e tente novamente.",
          429,
          "ifood_rate_limited",
        );
      }
      throw new IfoodOAuthError(
        "O iFood não conseguiu concluir a autenticação agora. Tente novamente.",
        502,
        "ifood_token_request_failed",
      );
    }
    const parsed = tokenResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new IfoodOAuthError(
        "O iFood retornou credenciais incompletas. Inicie a integração novamente.",
        502,
        "invalid_token_response",
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof IfoodOAuthError) throw error;
    throw new IfoodOAuthError(
      "Não foi possível contatar o iFood. Verifique sua conexão e tente novamente.",
      502,
      "ifood_unreachable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function sealIfoodCredential(
  value: string,
  secret = env.IFOOD_TOKEN_ENCRYPTION_KEY,
) {
  return sealValue(
    value,
    encryptionKey(secret, "missing_token_encryption_key"),
  );
}

export function unsealIfoodCredential(
  value: string,
  secret = env.IFOOD_TOKEN_ENCRYPTION_KEY,
) {
  try {
    return unsealValue(
      value,
      encryptionKey(secret, "missing_token_encryption_key"),
    );
  } catch (error) {
    if (error instanceof IfoodOAuthError) throw error;
    throw new IfoodOAuthError(
      "As credenciais armazenadas do iFood são inválidas.",
      503,
      "invalid_stored_credential",
    );
  }
}

export function sealIfoodOAuthState(
  state: IfoodOAuthState,
  secret?: string,
) {
  const validated = oauthStateSchema.parse(state);
  return sealValue(JSON.stringify(validated), oauthSecret(secret));
}

export function unsealIfoodOAuthState(value: string, secret?: string) {
  try {
    const decrypted = unsealValue(value, oauthSecret(secret));
    const state = oauthStateSchema.parse(JSON.parse(decrypted));
    if (state.expiresAt <= Date.now()) {
      throw new IfoodOAuthError("O código de vinculação expirou.", 400, "state_expired");
    }
    return state;
  } catch (error) {
    if (error instanceof IfoodOAuthError) throw error;
    throw new IfoodOAuthError("Estado de autorização inválido.", 400, "invalid_state");
  }
}

export function getIfoodOAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/integrations/ifood",
    maxAge,
  };
}
