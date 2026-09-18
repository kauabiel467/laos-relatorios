import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { authorizeProject } from "@/lib/projects/access";
import {
  readMetaSessionToken,
  requireMetaUser,
} from "@/lib/integrations/meta-oauth";
import { fetchGraph, MetaGraphError } from "@/lib/integrations/meta-graph";
import {
  type AnalysisConfig,
  type AnalysisData,
  type InsightItem,
} from "./model";
import { metaMetrics, type MetaMetricRow as Row } from "@/lib/metrics/engine";
import { resolvePeriod } from "@/lib/metrics/dates";
import { METRICS } from "@/lib/metrics/catalog";
import { adaptModernMeta } from "@/lib/metrics/meta-adapters";
import type { MetaAdAccount } from "@/lib/types";
import type {
  ProjectMetaConnection,
  ProjectMetaConnectionStatus,
} from "@/lib/agency/types";

type MetaAccountProbe = {
  id: string;
  name?: string;
  account_status?: number | string;
  disable_reason?: number | string;
  currency?: string;
  timezone_name?: string;
};

function connectionFailure(error: unknown): {
  status: Exclude<ProjectMetaConnectionStatus, "connected" | "untested">;
  category: string;
  message: string;
} {
  if (error instanceof MetaGraphError) {
    if (error.code === 190) {
      return {
        status: "reauth_required",
        category: "authorization_expired",
        message: "A autorização da Meta expirou ou foi revogada. Reconecte a conta.",
      };
    }
    if (error.code === 10 || error.code === 200) {
      return {
        status: "error",
        category: "insufficient_permission",
        message: "A Meta não liberou as permissões necessárias para consultar esta conta.",
      };
    }
    if (error.transient || [4, 17, 32, 613].includes(error.code ?? -1)) {
      return {
        status: "temporarily_unavailable",
        category: "temporary_failure",
        message: "A Meta está temporariamente indisponível. Tente o teste novamente.",
      };
    }
  }
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  if (raw.includes("expirou") || raw.includes("revogada") || raw.includes("reconecte")) {
    return {
      status: "reauth_required",
      category: "authorization_expired",
      message: "A autorização da Meta expirou ou foi revogada. Reconecte a conta.",
    };
  }
  return {
    status: "error",
    category: "connection_test_failed",
    message: "Não foi possível validar a conta Meta. Confira o acesso e tente novamente.",
  };
}

async function probeMetaAccount(account: string, token: string) {
  const info = await fetchGraph<MetaAccountProbe>(
    account,
    {
      fields:
        "id,name,account_status,disable_reason,currency,timezone_name",
    },
    token,
  );
  if (info.id !== account && `act_${info.id}` !== account) {
    throw Error("A Meta retornou uma conta diferente da selecionada.");
  }
  // An empty Insights result is a valid connection with no data. A permission
  // or token failure still rejects the request, proving the dashboard can read.
  await fetchGraph<{ data: unknown[] }>(
    account + "/insights",
    { fields: "spend", date_preset: "last_7d", limit: "1" },
    token,
  );
  return info;
}

function connectionSummary(
  accountId: string,
  info: MetaAccountProbe,
  connectedAt: string,
): ProjectMetaConnection {
  return {
    account_id: accountId,
    account_name: info.name ?? accountId,
    account_currency: info.currency ?? null,
    account_timezone: info.timezone_name ?? null,
    account_status: String(info.account_status ?? "UNKNOWN"),
    connection_status: "connected",
    connected_at: connectedAt,
    last_checked_at: connectedAt,
    last_success_at: connectedAt,
    last_error_category: null,
    last_error_message: null,
  };
}

export async function bindProjectMeta(cid: string, accountId: string) {
  const { db, user } = await authorizeProject(cid);
  const actor = await requireMetaUser();
  const sessionToken = await readMetaSessionToken();
  const admin = getSupabaseAdminClient();
  if (!admin || !sessionToken) throw Error("Conecte sua conta Meta.");
  const { data: s } = await admin
    .from("meta_integration_sessions")
    .select("id,accounts,stage,access_token")
    .eq("session_token", sessionToken)
    .eq("user_id", actor)
    .single();
  if (
    !s ||
    s.stage !== "connected" ||
    !s.access_token ||
    !(s.accounts as MetaAdAccount[] | null)?.some(
      (item) => item.id === accountId,
    )
  )
    throw Error("Autorize esta conta na conexão Meta.");
  if (actor !== user.id) throw Error("A sessão da Meta pertence a outro usuário.");
  const info = await probeMetaAccount(accountId, s.access_token as string);
  const checkedAt = new Date().toISOString();
  const { error } = await db.rpc("agency_bind_meta_connection", {
    cid,
    target_session_id: s.id,
    target_account_id: accountId,
  });
  if (error) throw Error("Não foi possível vincular a conta ao projeto.");
  // Only the server-side service role may promote an untested mapping to
  // connected. Calling the public RPC directly can never forge connection
  // health or provider metadata.
  const { error: healthError } = await admin
    .from("agency_meta_connections")
    .update({
      account_name: info.name ?? accountId,
      account_currency: info.currency ?? null,
      account_timezone: info.timezone_name ?? null,
      account_status: String(info.account_status ?? "UNKNOWN"),
      connection_status: "connected",
      last_checked_at: checkedAt,
      last_success_at: checkedAt,
      last_error_category: null,
      last_error_message: null,
    })
    .eq("client_id", cid);
  if (healthError) {
    throw Error(
      "A conta foi vinculada, mas não foi possível confirmar a saúde da conexão. Teste novamente.",
    );
  }
  return connectionSummary(accountId, info, checkedAt);
}
export async function unlinkProjectMeta(cid: string) {
  const { db } = await authorizeProject(cid, true);
  const { error } = await db.rpc("agency_unlink_meta_connection", { cid });
  if (error) throw Error("Não foi possível desvincular a conta deste projeto.");
}
async function credentials(cid: string) {
  await authorizeProject(cid);
  const admin = getSupabaseAdminClient();
  if (!admin) throw Error("Serviço indisponível.");
  const { data: c } = await admin
    .from("agency_meta_connections")
    .select("session_id,account_id")
    .eq("client_id", cid)
    .single();
  if (!c)
    throw Error("Vincule novamente a Meta nas integrações deste projeto.");
  const { data: s } = await admin
    .from("meta_integration_sessions")
    .select("access_token,stage,accounts")
    .eq("id", c.session_id)
    .single();
  if (
    !s?.access_token ||
    s.stage !== "connected" ||
    !(s.accounts as MetaAdAccount[] | null)?.some(
      (item) => item.id === c.account_id,
    )
  )
    throw Error(
      "A conexão expirou ou foi revogada. Reconecte a Meta nas integrações.",
    );
  const metadata = (s.accounts as MetaAdAccount[] | null)?.find(
    (item) => item.id === c.account_id || `act_${item.accountId}` === c.account_id,
  );
  return {
    token: s.access_token as string,
    account: c.account_id as string,
    timezone: metadata?.timezoneName,
    currency: metadata?.currency,
  };
}

export async function testProjectMetaConnection(cid: string) {
  await authorizeProject(cid);
  const admin = getSupabaseAdminClient();
  if (!admin) throw Error("Serviço indisponível.");
  const checkedAt = new Date().toISOString();
  try {
    const { token, account } = await credentials(cid);
    const info = await probeMetaAccount(account, token);
    const { data: current } = await admin
      .from("agency_meta_connections")
      .select("connected_at")
      .eq("client_id", cid)
      .single();
    const { error } = await admin
      .from("agency_meta_connections")
      .update({
        account_name: info.name ?? account,
        account_currency: info.currency ?? null,
        account_timezone: info.timezone_name ?? null,
        account_status: String(info.account_status ?? "UNKNOWN"),
        connection_status: "connected",
        last_checked_at: checkedAt,
        last_success_at: checkedAt,
        last_error_category: null,
        last_error_message: null,
      })
      .eq("client_id", cid);
    if (error) throw Error("Não foi possível salvar o teste da conexão.");
    return connectionSummary(
      account,
      info,
      (current?.connected_at as string | undefined) ?? checkedAt,
    );
  } catch (error) {
    const failure = connectionFailure(error);
    await admin
      .from("agency_meta_connections")
      .update({
        connection_status: failure.status,
        last_checked_at: checkedAt,
        last_error_category: failure.category,
        last_error_message: failure.message.slice(0, 500),
      })
      .eq("client_id", cid);
    throw Error(failure.message);
  }
}
export async function projectCampaigns(cid: string) {
  const { token, account } = await credentials(cid);
  const result = await fetchGraph<{
    data: { id: string; name: string; status: string }[];
  }>(account + "/campaigns", { fields: "id,name,status", limit: "100" }, token);
  return result.data;
}
export async function collectAnalysis(
  cid: string,
  config: AnalysisConfig,
): Promise<AnalysisData> {
  const credentialsResult = await credentials(cid);
  const { token, account } = credentialsResult;
  let timezone = credentialsResult.timezone;
  let currency = credentialsResult.currency;
  if (!timezone || !currency) {
    const accountInfo = await fetchGraph<{ currency?: string; timezone_name?: string }>(
      account,
      { fields: "currency,timezone_name" },
      token,
    );
    timezone = accountInfo.timezone_name || "UTC";
    currency = accountInfo.currency || "BRL";
  }
  const effective = resolvePeriod(
    config.preset,
    timezone,
    { since: config.since, until: config.until },
    config.comparison,
    { since: config.compare_since, until: config.compare_until },
  );
  const fields = "spend,impressions,reach,clicks,actions,action_values";
  const filters = config.campaign_ids.length
    ? {
        filtering: JSON.stringify([
          { field: "campaign.id", operator: "IN", value: config.campaign_ids },
        ]),
      }
    : {};
  if (config.campaign_ids.length) {
    const { data: campaigns } = await fetchGraph<{ data: { id: string }[] }>(
      account + "/campaigns",
      { fields: "id", limit: "100" },
      token,
    );
    if (config.campaign_ids.some((id) => !campaigns.some((c) => c.id === id)))
      throw Error("Uma campanha selecionada não pertence à conta do projeto.");
  }
  const query = (
    since: string,
    until: string,
    extra: Record<string, string> = {},
  ) =>
    fetchGraph<{ data: Row[] }>(
      account + "/insights",
      {
        fields,
        limit: "100",
        time_range: JSON.stringify({ since, until }),
        ...filters,
        ...extra,
      } as Record<string, string>,
      token,
    );
  const optional = async (label: string, p: Promise<{ data: Row[] }>) => {
    try {
      return (await p).data;
    } catch {
      return { warning: label + " indisponível nesta atualização." };
    }
  };
  const [
    current,
    previous,
    daily,
    campaigns,
    adsets,
    ads,
    platforms,
    audience,
  ] = await Promise.all([
    query(effective.since, effective.until),
    config.comparison === "none"
      ? null
      : query(effective.compare_since!, effective.compare_until!),
    query(effective.since, effective.until, {
      time_increment: "1",
      fields: "date_start," + fields,
    }),
    query(effective.since, effective.until, {
      level: "campaign",
      fields: "campaign_id,campaign_name," + fields,
    }),
    optional(
      "Conjuntos",
      query(effective.since, effective.until, {
        level: "adset",
        fields: "adset_id,adset_name," + fields,
      }),
    ),
    optional(
      "Anúncios",
      query(effective.since, effective.until, {
        level: "ad",
        fields: "ad_id,ad_name," + fields,
      }),
    ),
    optional(
      "Plataformas",
      query(effective.since, effective.until, { breakdowns: "publisher_platform" }),
    ),
    optional(
      "Público",
      query(effective.since, effective.until, { breakdowns: "age,gender" }),
    ),
  ]);
  const warnings: string[] = [];
  const rows = (r: Row[] | { warning: string }) => {
    if ("warning" in r) {
      warnings.push(r.warning);
      return [];
    }
    return r;
  };
  const items = (r: Row[], key: string): InsightItem[] =>
    r
      .map((x) => ({
        id: String(x[key + "_id"] ?? x[key] ?? ""),
        name: String(x[key + "_name"] ?? x[key] ?? ""),
        metrics: metaMetrics(x),
      }))
      .sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0));
  const adItems = items(rows(ads), "ad");
  await Promise.all(
    adItems.slice(0, 12).map(async (ad) => {
      try {
        const creative = await fetchGraph<{
          creative?: { thumbnail_url?: string };
        }>(ad.id, { fields: "creative{thumbnail_url}" }, token);
        ad.thumbnail = creative.creative?.thumbnail_url;
      } catch {
        /* Ad metrics remain available when a preview is unavailable. */
      }
    }),
  );
  const platformRows = rows(platforms);
  const audienceRows = rows(audience);
  const projection = adaptModernMeta({
    current: current.data[0],
    previous: previous?.data[0],
    daily: daily.data,
    campaigns: campaigns.data,
  }, config.primary_metric);
  const primaryLabel = METRICS[config.primary_metric].label;
  if (platformRows.length && platformRows.every((row) => metaMetrics(row)[config.primary_metric] == null))
    warnings.push(`Plataformas sem suporte ao KPI ${primaryLabel} nesta consulta.`);
  if (audienceRows.length && audienceRows.every((row) => metaMetrics(row)[config.primary_metric] == null))
    warnings.push(`Segmentos de público sem suporte ao KPI ${primaryLabel} nesta consulta.`);
  return {
    current: projection.current,
    previous: previous ? projection.previous : null,
    daily: projection.series.map((row) => ({ date: row.date, metrics: row.metrics })),
    campaigns: projection.campaigns
      .map((row) => ({ id: row.id, name: row.name, metrics: row.metrics }))
      .sort((a, b) => (b.metrics.spend ?? 0) - (a.metrics.spend ?? 0)),
    adsets: items(rows(adsets), "adset"),
    ads: adItems,
    platforms: items(platformRows, "publisher_platform"),
    audience: audienceRows.map((r) => ({
      id: String(r.age) + "-" + String(r.gender),
      name:
        String(r.age) +
        " · " +
        ({ male: "Masculino", female: "Feminino", unknown: "Não informado" }[
          String(r.gender)
        ] ?? String(r.gender)),
      metrics: metaMetrics(r),
    })),
    warnings,
    currency,
    timezone,
    primary_metric: config.primary_metric,
    effective_period: {
      since: effective.since,
      until: effective.until,
      compare_since: effective.compare_since,
      compare_until: effective.compare_until,
    },
    updated_at: new Date().toISOString(),
  };
}
