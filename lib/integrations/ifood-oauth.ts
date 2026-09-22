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

export class IfoodOAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 429 | 502 | 503,
    public readonly code: string,
  ) {
    super(message);
    this.name = "IfoodOAuthError";
  }
}

function oauthSecret(secret = env.IFOOD_OAUTH_STATE_SECRET) {
  if (!secret || secret.length < 32) {
    throw new IfoodOAuthError(
      "A integração iFood ainda não foi configurada pelo administrador.",
      503,
      "missing_state_secret",
    );
  }
  return createHash("sha256").update(secret).digest();
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

export function sealIfoodOAuthState(
  state: IfoodOAuthState,
  secret?: string,
) {
  const validated = oauthStateSchema.parse(state);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", oauthSecret(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(validated), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function unsealIfoodOAuthState(value: string, secret?: string) {
  const [version, encodedIv, encodedTag, encodedPayload] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedPayload) {
    throw new IfoodOAuthError("Estado de autorização inválido.", 400, "invalid_state");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      oauthSecret(secret),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedPayload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
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
