import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase/server";
import {
  readMetaSessionToken,
  requireMetaUser,
} from "@/lib/integrations/meta-oauth";
import { fetchGraph } from "@/lib/integrations/meta-dashboard";
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
export async function authorizeProject(cid: string) {
  const db = await getSupabaseServerClient();
  if (!db) throw Error("Serviço indisponível.");
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw Error("UNAUTHORIZED");
  const { data: c } = await db
    .from("agency_clients")
    .select("*")
    .eq("id", cid)
    .single();
  if (!c) throw Error("Projeto não encontrado.");
  const { data: m } = await db
    .from("team_members")
    .select("role")
    .eq("team_id", c.team_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m) throw Error("Esta ação é exclusiva da equipe do projeto.");
  return { db, user, client: c, role: m.role };
}
export async function bindProjectMeta(cid: string, accountId: string) {
  const { db, user } = await authorizeProject(cid);
  const actor = await requireMetaUser();
  const token = await readMetaSessionToken();
  const admin = getSupabaseAdminClient();
  if (!admin || !token) throw Error("Conecte sua conta Meta.");
  const { data: s } = await admin
    .from("meta_integration_sessions")
    .select("id,accounts,stage,selected_account_ids")
    .eq("session_token", token)
    .eq("user_id", actor)
    .single();
  if (
    !s ||
    s.stage !== "connected" ||
    !s.selected_account_ids.includes(accountId)
  )
    throw Error("Autorize esta conta na conexão Meta.");
  const connected_at = new Date().toISOString();
  const { error } = await admin
    .from("agency_meta_connections")
    .upsert({
      client_id: cid,
      session_id: s.id,
      account_id: accountId,
      connected_by: user.id,
      connected_at,
    });
  if (error) throw Error("Não foi possível vincular a conta.");
  const { error: e } = await db
    .from("agency_clients")
    .update({ meta_account_id: accountId, meta_connected_at: connected_at })
    .eq("id", cid);
  if (e) throw Error("Não foi possível atualizar o projeto.");
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
    .select("access_token,stage,selected_account_ids,accounts")
    .eq("id", c.session_id)
    .single();
  if (
    !s?.access_token ||
    s.stage !== "connected" ||
    !s.selected_account_ids.includes(c.account_id)
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
