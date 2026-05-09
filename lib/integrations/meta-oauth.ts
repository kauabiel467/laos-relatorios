import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { MetaAdAccount, MetaIntegrationStatus } from "@/lib/types";

const META_GRAPH_VERSION = "v22.0";
export const META_OAUTH_STATE_COOKIE = "laos_meta_oauth_state";
export const META_DRAFT_COOKIE = "laos_meta_oauth_draft";
export const META_CONNECTION_COOKIE = "laos_meta_oauth_connection";
export const META_RETURN_COOKIE = "laos_meta_oauth_return";

export interface StoredDraft {
  accessToken: string;
  connectedAt: string;
  accounts: MetaAdAccount[];
}

export interface StoredConnection extends StoredDraft {
  selectedAccountIds: string[];
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

  const cookieStore = await cookies();
  const connected = fromBase64Url<StoredConnection>(cookieStore.get(META_CONNECTION_COOKIE)?.value);
  if (connected) {
    const selected = connected.accounts.filter((account) => connected.selectedAccountIds.includes(account.id));
    return {
      stage: "connected",
      connectedAt: connected.connectedAt,
      accounts: selected
    };
  }

  const draft = fromBase64Url<StoredDraft>(cookieStore.get(META_DRAFT_COOKIE)?.value);
  if (draft) {
    return {
      stage: "needs_selection",
      connectedAt: draft.connectedAt,
      accounts: draft.accounts
    };
  }

  return {
    stage: "disconnected",
    accounts: []
  };
}

export async function createMetaOAuthState(returnTo?: string) {
  const state = crypto.randomUUID();
  return {
    state,
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

export function serializeMetaDraft(draft: StoredDraft) {
  return toBase64Url(JSON.stringify(draft));
}

export async function getMetaDraft() {
  const cookieStore = await cookies();
  return fromBase64Url<StoredDraft>(cookieStore.get(META_DRAFT_COOKIE)?.value);
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

  return {
    draft,
    serialized: serializeMetaConnection(draft, selectedAccountIds)
  };
}

export async function disconnectMetaIntegration() {
  return [
    META_CONNECTION_COOKIE,
    META_DRAFT_COOKIE,
    META_OAUTH_STATE_COOKIE,
    META_RETURN_COOKIE
  ];
}
