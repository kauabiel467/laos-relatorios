import type { ProjectIfoodConnection } from "@/lib/agency/types";
import {
  IfoodOAuthError,
  requestIfoodAccessToken,
  sealIfoodCredential,
} from "@/lib/integrations/ifood-oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const SUMMARY_COLUMNS =
  "connection_status,token_expires_at,connected_at,updated_at,last_error";

function requireAdmin() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new IfoodOAuthError(
      "O armazenamento seguro das integrações está indisponível.",
      503,
      "ifood_storage_unavailable",
    );
  }
  return admin;
}

export async function getProjectIfoodConnection(clientId: string) {
  const admin = requireAdmin();
  const { data, error } = await admin
    .from("agency_ifood_connections")
    .select(SUMMARY_COLUMNS)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    throw new IfoodOAuthError(
      "Não foi possível carregar o estado da integração iFood.",
      503,
      "ifood_storage_read_failed",
    );
  }
  return data as ProjectIfoodConnection | null;
}

async function saveFailure(
  clientId: string,
  userId: string,
  error: IfoodOAuthError,
) {
  const admin = getSupabaseAdminClient();
  if (
    !admin ||
    error.code === "connection_already_exists" ||
    error.code.startsWith("ifood_storage_")
  ) return;
  await admin.from("agency_ifood_connections").upsert(
    {
      client_id: clientId,
      connection_status: "error",
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
      token_expires_at: null,
      connected_by: userId,
      connected_at: null,
      last_error: error.message.slice(0, 1000),
    },
    { onConflict: "client_id" },
  );
}

export async function completeProjectIfoodConnection({
  clientId,
  userId,
  authorizationCode,
  authorizationCodeVerifier,
}: {
  clientId: string;
  userId: string;
  authorizationCode: string;
  authorizationCodeVerifier: string;
}) {
  const admin = requireAdmin();
  const { data: existing, error: existingError } = await admin
    .from("agency_ifood_connections")
    .select("connection_status")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existingError) {
    throw new IfoodOAuthError(
      "O armazenamento seguro do iFood ainda não está disponível.",
      503,
      "ifood_storage_read_failed",
    );
  }
  if (existing?.connection_status === "connected") {
    throw new IfoodOAuthError(
      "Este projeto já possui uma integração iFood conectada.",
      409,
      "connection_already_exists",
    );
  }

  try {
    const token = await requestIfoodAccessToken(
      authorizationCode,
      authorizationCodeVerifier,
    );
    const now = new Date();
    const tokenExpiresAt = new Date(
      now.getTime() + token.expiresIn * 1000,
    ).toISOString();
    const { data, error } = await admin
      .from("agency_ifood_connections")
      .upsert(
        {
          client_id: clientId,
          connection_status: "connected",
          access_token_ciphertext: sealIfoodCredential(token.accessToken),
          refresh_token_ciphertext: sealIfoodCredential(token.refreshToken),
          token_expires_at: tokenExpiresAt,
          connected_by: userId,
          connected_at: now.toISOString(),
          updated_at: now.toISOString(),
          last_error: null,
        },
        { onConflict: "client_id" },
      )
      .select(SUMMARY_COLUMNS)
      .single();
    if (error || !data) {
      throw new IfoodOAuthError(
        "O iFood autorizou o acesso, mas não foi possível salvar a conexão. Gere um novo código e tente novamente.",
        503,
        "ifood_storage_write_failed",
      );
    }
    return data as ProjectIfoodConnection;
  } catch (error) {
    const normalized =
      error instanceof IfoodOAuthError
        ? error
        : new IfoodOAuthError(
            "Não foi possível concluir a integração com o iFood.",
            502,
            "ifood_connection_failed",
          );
    await saveFailure(clientId, userId, normalized);
    throw normalized;
  }
}
