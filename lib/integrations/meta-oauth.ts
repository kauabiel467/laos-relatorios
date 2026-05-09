import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { MetaAdAccount, MetaIntegrationStatus } from "@/lib/types";

const META_GRAPH_VERSION = "v22.0";
export const META_OAUTH_STATE_COOKIE = "laos_meta_oauth_state";
export const META_DRAFT_COOKIE = "laos_meta_oauth_draft";
export const META_CONNECTION_COOKIE = "laos_meta_oauth_connection";
export const META_RETURN_COOKIE = "laos_meta_oauth_return";
export const META_SESSION_COOKIE = "laos_meta_session";
const META_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export interface StoredDraft {
  accessToken: string;
  connectedAt: string;
  accounts: MetaAdAccount[];
}

export interface StoredConnection extends StoredDraft {
  selectedAccountIds: string[];
}

interface MetaIntegrationSessionRow {
  session_token: string;
  stage: "disconnected" | "needs_selection" | "connected";
  access_token: string | null;
  accounts: MetaAdAccount[];
  selected_account_ids: string[];
  connected_at: string | null;
}

function isSecureCookieEnabled() {
  return env.NEXT_PUBLIC_APP_URL.startsWith("https://");
}

export function getMetaCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureCookieEnabled(),
    path: "/",
    maxAge
  };
}

function sanitizeReturnTo(returnTo?: string) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function fromBase64Url<T>(value: string | undefined): T | null {
  if (!value) return null;

  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

function getMetaAdminClient() {
  return getSupabaseAdminClient();
}

async function getMetaSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(META_SESSION_COOKIE)?.value || null;
}

async function getMetaSessionRow(sessionToken: string) {
  const admin = getMetaAdminClient();
  if (!admin) {
    throw new Error("Supabase server nao configurado para persistir a integracao da Meta.");
  }

  const { data, error } = await admin
    .from("meta_integration_sessions")
    .select("session_token, stage, access_token, accounts, selected_account_ids, connected_at")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (error) {
    throw new Error("Nao foi possivel consultar a sessao da integracao Meta.");
  }

  return data as MetaIntegrationSessionRow | null;
}

async function upsertMetaSession(
  sessionToken: string,
  payload: Partial<MetaIntegrationSessionRow> & Pick<MetaIntegrationSessionRow, "stage">
) {
  const admin = getMetaAdminClient();
  if (!admin) {
    throw new Error("Supabase server nao configurado para persistir a integracao da Meta.");
  }

  const { error } = await admin.from("meta_integration_sessions").upsert(
    {
      session_token: sessionToken,
      stage: payload.stage,
      access_token: payload.access_token ?? null,
      accounts: payload.accounts ?? [],
      selected_account_ids: payload.selected_account_ids ?? [],
      connected_at: payload.connected_at ?? null
    },
    {
      onConflict: "session_token"
    }
  );

  if (error) {
    throw new Error("Nao foi possivel salvar a sessao da integracao Meta.");
  }
}

async function deleteMetaSession(sessionToken: string) {
  const admin = getMetaAdminClient();
  if (!admin) {
    return;
  }

  await admin.from("meta_integration_sessions").delete().eq("session_token", sessionToken);
}

export function hasMetaOAuthConfig() {
  return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.NEXT_PUBLIC_APP_URL);
}

export function getMetaRedirectUri() {
  return `${env.NEXT_PUBLIC_APP_URL}/api/integrations/meta/callback`;
}

export function getMetaPermissions() {
  return ["ads_read", "business_management"];
}

export function buildMetaOAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID!,
    redirect_uri: getMetaRedirectUri(),
    state,
    response_type: "code",
    scope: getMetaPermissions().join(",")
  });

  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "Falha na comunicacao com a Meta.";
    throw new Error(message);
  }

  return payload as T;
}

export async function exchangeCodeForToken(code: string) {
  const params = new URLSearchParams({
    client_id: env.META_APP_ID!,
    client_secret: env.META_APP_SECRET!,
    redirect_uri: getMetaRedirectUri(),
    code
  });

  const tokenResponse = await fetchJson<{ access_token: string }>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params.toString()}`
  );

  const longLivedParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env.META_APP_ID!,
    client_secret: env.META_APP_SECRET!,
    fb_exchange_token: tokenResponse.access_token
  });

  const longLivedResponse = await fetchJson<{ access_token: string }>(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${longLivedParams.toString()}`
  );

  return longLivedResponse.access_token;
}

export async function fetchMetaAdAccounts(accessToken: string) {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "id,name,account_status,currency,timezone_name",
    limit: "200"
  });

  const payload = await fetchJson<{
    data: Array<{
      id: string;
      name: string;
      account_status?: number | string;
      currency?: string;
      timezone_name?: string;
    }>;
  }>(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?${params.toString()}`);

  return payload.data.map((account) => ({
    id: account.id,
    accountId: account.id.replace(/^act_/, ""),
    name: account.name,
    status: String(account.account_status ?? "UNKNOWN"),
    currency: account.currency,
    timezoneName: account.timezone_name
  })) satisfies MetaAdAccount[];
}

export async function getMetaStatus(): Promise<MetaIntegrationStatus> {
  if (!hasMetaOAuthConfig()) {
    return {
      stage: "missing_config",
      error: "Configure META_APP_ID e META_APP_SECRET para habilitar a integracao da Meta.",
      accounts: []
    };
  }

  try {
    const sessionToken = await getMetaSessionToken();
    if (!sessionToken) {
      return {
        stage: "disconnected",
        accounts: []
      };
    }

    const session = await getMetaSessionRow(sessionToken);
    if (!session) {
      return {
        stage: "disconnected",
        accounts: []
      };
    }

    if (session.stage === "connected") {
      const selected = session.accounts.filter((account) => session.selected_account_ids.includes(account.id));
      return {
        stage: "connected",
        connectedAt: session.connected_at || undefined,
        accounts: selected
      };
    }

    if (session.stage === "needs_selection") {
      return {
        stage: "needs_selection",
        connectedAt: session.connected_at || undefined,
        accounts: session.accounts
      };
    }

    return {
      stage: "disconnected",
      accounts: []
    };
  } catch (error) {
    return {
      stage: "disconnected",
      error: error instanceof Error ? error.message : "Nao foi possivel carregar a integracao da Meta.",
      accounts: []
    };
  }
}

export async function createMetaOAuthState(returnTo?: string) {
  const state = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();

  return {
    state,
    sessionToken,
    returnTo: sanitizeReturnTo(returnTo)
  };
}

export async function readMetaOAuthState() {
  const cookieStore = await cookies();
  return cookieStore.get(META_OAUTH_STATE_COOKIE)?.value;
}

export async function readMetaReturnTo() {
  const cookieStore = await cookies();
  return cookieStore.get(META_RETURN_COOKIE)?.value || "/";
}

export async function readMetaSessionToken() {
  return getMetaSessionToken();
}

export async function saveMetaDraft(sessionToken: string, draft: StoredDraft) {
  await upsertMetaSession(sessionToken, {
    stage: "needs_selection",
    access_token: draft.accessToken,
    accounts: draft.accounts,
    selected_account_ids: [],
    connected_at: draft.connectedAt
  });
}

export async function getMetaDraft() {
  const sessionToken = await getMetaSessionToken();
  if (!sessionToken) {
    return null;
  }

  const session = await getMetaSessionRow(sessionToken);
  if (!session || session.stage !== "needs_selection" || !session.access_token) {
    return null;
  }

  return {
    sessionToken,
    accessToken: session.access_token,
    accounts: session.accounts,
    connectedAt: session.connected_at || new Date().toISOString()
  };
}

export function serializeMetaDraft(draft: StoredDraft) {
  return toBase64Url(JSON.stringify(draft));
}

export function serializeMetaConnection(draft: StoredDraft, selectedAccountIds: string[]) {
  return toBase64Url(
    JSON.stringify({
      ...draft,
      selectedAccountIds
    } satisfies StoredConnection)
  );
}

export async function finalizeMetaSelection(selectedAccountIds: string[]) {
  const draft = await getMetaDraft();
  if (!draft) {
    throw new Error("Nenhuma conexao pendente da Meta foi encontrada.");
  }

  await upsertMetaSession(draft.sessionToken, {
    stage: "connected",
    access_token: draft.accessToken,
    accounts: draft.accounts,
    selected_account_ids: selectedAccountIds,
    connected_at: draft.connectedAt
  });

  return {
    draft,
    serialized: serializeMetaConnection(draft, selectedAccountIds)
  };
}

export async function disconnectMetaIntegration() {
  const sessionToken = await getMetaSessionToken();
  if (sessionToken) {
    await deleteMetaSession(sessionToken);
  }

  return [
    META_CONNECTION_COOKIE,
    META_DRAFT_COOKIE,
    META_OAUTH_STATE_COOKIE,
    META_RETURN_COOKIE,
    META_SESSION_COOKIE
  ];
}

export function getMetaSessionCookieMaxAge() {
  return META_SESSION_MAX_AGE;
}
