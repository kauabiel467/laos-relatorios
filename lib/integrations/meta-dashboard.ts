import { requireMetaUser } from "./meta-oauth";
import type {
  AdItem,
  AgeAudiencePoint,
  AlertItem,
  CampaignMetric,
  DashboardDataBundle,
  DashboardSnapshot,
  DailyPoint,
  FunnelStep,
  GenderAudiencePoint,
  HourlyPerformancePoint,
  MediaMetricCard,
  ObjectiveDistributionItem
} from "@/lib/types";
import { readMetaSessionToken } from "@/lib/integrations/meta-oauth";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  METRICS,
  primaryCostDefinition,
  type PrimaryKpiId,
} from "@/lib/metrics/catalog";
import {
  metaMetrics,
  metricChange,
  primaryMetricSnapshot,
  type MetaMetricRow,
} from "@/lib/metrics/engine";
import { resolvePeriod } from "@/lib/metrics/dates";
import { adaptLegacyMeta } from "@/lib/metrics/meta-adapters";
import type { MetaAdAccount } from "@/lib/types";

type PeriodKey = "last_7d" | "last_30d" | "last_90d" | "custom";

type MetaInsightRow = MetaMetricRow & {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  purchase_roas?: Array<{
    action_type: string;
    value: string;
  }>;
  date_start?: string;
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  age?: string;
  gender?: string;
};

type MetaCampaignRow = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
};

type MetaCampaignInsightRow = MetaInsightRow & {
  campaign_id: string;
  campaign_name?: string;
};

type MetaAdInsightRow = {
  ad_id: string;
  ad_name?: string;
  ctr?: string;
  cpc?: string;
  spend?: string;
  impressions?: string;
};

type MetaAdCreativeRow = {
  id: string;
  name?: string;
  creative?: {
    object_type?: string;
    thumbnail_url?: string;
  };
};

type MetaSessionRow = {
  access_token: string | null;
  selected_account_ids: string[];
  accounts: MetaAdAccount[];
};

interface MetaSessionInfo {
  accessToken: string;
  selectedAccountIds: string[];
  accounts: MetaAdAccount[];
}

const META_GRAPH_VERSION = "v22.0";

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildTimeRangeParams(start: string, end: string) {
  return {
    time_range: JSON.stringify({
      since: start,
      until: end
    })
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatObjective(value?: string) {
  if (!value) return "Sem objetivo";
  const objectiveMap: Record<string, string> = {
    SALES: "Vendas",
    OUTCOME_SALES: "Vendas",
    TRAFFIC: "Trafego",
    OUTCOME_TRAFFIC: "Trafego",
    ENGAGEMENT: "Engajamento",
    OUTCOME_ENGAGEMENT: "Engajamento",
    BRAND_AWARENESS: "Reconhecimento de marca",
    OUTCOME_AWARENESS: "Reconhecimento de marca",
    REACH: "Alcance",
    LEADS: "Leads",
    OUTCOME_LEADS: "Leads",
    APP_PROMOTION: "Promocao de aplicativo",
    OUTCOME_APP_PROMOTION: "Promocao de aplicativo",
    VIDEO_VIEWS: "Visualizacoes de video",
    MESSAGES: "Mensagens",
    OUTCOME_MESSAGES: "Mensagens"
  };

  const normalizedKey = String(value).toUpperCase();
  if (objectiveMap[normalizedKey]) {
    return objectiveMap[normalizedKey];
  }

  const normalized = value.replaceAll("_", " ").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeCampaignStatus(status?: string) {
  return String(status || "").toUpperCase() === "PAUSED" ? "PAUSED" : "ACTIVE";
}

function buildHealthScore(spend: number, resultValue: number | null, roas: number, primaryCost: number | null, resultDelta: number | null, roasDelta: number | null, primaryKpi: PrimaryKpiId) {
  let score = 55;
  if (primaryKpi === "purchases") score += clamp(roas * 10, 0, 25);
  score += clamp((resultDelta ?? 0) / 4, -12, 12);
  if (primaryKpi === "purchases") score += clamp((roasDelta ?? 0) / 5, -10, 10);
  score -= clamp((primaryCost ?? 0) / 8, 0, 18);
  score += spend > 0 ? 6 : -6;
  score += (resultValue ?? 0) > 0 ? 8 : -12;

  return Math.round(clamp(score, 8, 98));
}

function buildHealthLabel(score: number) {
  if (score >= 80) {
    return { label: "Operacao saudavel", tone: "green" as const };
  }

  if (score >= 60) {
    return { label: "Atencao moderada", tone: "yellow" as const };
  }

  return { label: "Revisao urgente", tone: "red" as const };
}

function buildFunnel(row: MetaInsightRow | undefined): FunnelStep[] {
  const values = metaMetrics(row);

  return ([
    { label: "Cliques", value: values.link_clicks ?? 0, color: "indigo" },
    { label: "Page views", value: values.landing_views ?? 0, color: "purple" },
    { label: "Checkout iniciado", value: values.checkouts ?? 0, color: "orange" },
    { label: "Vendas", value: values.purchases ?? 0, color: "green" }
  ] satisfies FunnelStep[]).filter((step) => step.value > 0);
}

function buildAlerts(spendDelta: number | null, resultDelta: number | null, primaryCostDelta: number | null, roasDelta: number | null, roas: number, primaryCostLabel: string, primaryKpi: PrimaryKpiId): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (spendDelta != null && resultDelta != null && spendDelta > 5 && resultDelta < 0) {
    alerts.push({
      id: "spend_result",
      title: "Investimento subiu e resultado caiu",
      description: "A conta ganhou gasto, mas a entrega final perdeu tracao no periodo atual.",
      tone: "high"
    });
  }

  if (primaryCostDelta != null && primaryCostDelta > 15) {
    alerts.push({
      id: "primary_cost_pressure",
      title: `${primaryCostLabel} piorou acima do ideal`,
      description: "Vale revisar criativos, público e posicionamentos antes de ampliar a verba.",
      tone: "warning"
    });
  }

  if (primaryKpi === "purchases" && roasDelta != null && roasDelta < -10) {
    alerts.push({
      id: "roas_drop",
      title: "ROAS caiu no comparativo",
      description: "O retorno da conta desacelerou frente ao periodo anterior.",
      tone: "high"
    });
  }

  if (primaryKpi === "purchases" && roas >= 3) {
    alerts.push({
      id: "roas_good",
      title: "Conta com boa eficiencia",
      description: "Existem sinais de escala em campanhas com retorno sustentavel acima da media.",
      tone: "good"
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "stable",
      title: "Conta estavel no periodo",
      description: "Sem alerta critico no comparativo atual. Siga observando custo e consistencia do resultado.",
      tone: "neutral"
    });
  }

  return alerts.slice(0, 4);
}

function comparisonPhrase(label: string, delta: number | null) {
  if (delta == null) return `${label} sem base comparável no período anterior`;
  return `${label} ${delta >= 0 ? "subiu" : "caiu"} ${Math.abs(delta).toFixed(1)}%`;
}

function buildQuickInsights(current: MetaInsightRow | undefined, previous: MetaInsightRow | undefined, primaryKpi: PrimaryKpiId) {
  const currentValues = metaMetrics(current);
  const previousValues = metaMetrics(previous);
  const spendDelta = metricChange(currentValues.spend, previousValues.spend);
  const resultDelta = metricChange(currentValues[primaryKpi], previousValues[primaryKpi]);
  const ctrDelta = metricChange(currentValues.ctr, previousValues.ctr);
  const resultLabel = METRICS[primaryKpi].label;

  return [
    {
      label: "O que aconteceu",
      title: `${comparisonPhrase("Investimento", spendDelta)} e ${comparisonPhrase(resultLabel.toLowerCase(), resultDelta)}.`,
      description: "Comparativo automático contra o período de comparação configurado.",
      tone: "blue" as const
    },
    {
      label: "Por que importa",
      title: `${comparisonPhrase("CTR", ctrDelta)} no período.`,
      description: "A taxa de clique ajuda a identificar cedo quando a conta esta ganhando ou perdendo tracao.",
      tone: "orange" as const
    },
    {
      label: "Proxima acao",
      title: resultDelta != null && resultDelta < 0 ? "Prioridade em revisar campanhas com maior custo e menor retorno." : "Mapear as campanhas mais eficientes para escalar com segurança.",
      description: "O painel cruza conta ativa, campanhas e comparativo para acelerar a decisao.",
      tone: "green" as const
    }
  ];
}

function buildMediaMetrics(current: MetaInsightRow | undefined, previous: MetaInsightRow | undefined): MediaMetricCard[] {
  const currentValues = metaMetrics(current);
  const previousValues = metaMetrics(previous);
  const inverse = (value: number | null) => value == null ? null : value * -1;

  return [
    { label: "Alcance", value: currentValues.reach ?? 0, delta: metricChange(currentValues.reach, previousValues.reach), format: "compact", tone: "purple" },
    { label: "Cliques no Link", value: currentValues.link_clicks ?? 0, delta: metricChange(currentValues.link_clicks, previousValues.link_clicks), format: "compact", tone: "blue" },
    { label: "CTR", value: currentValues.ctr ?? 0, delta: metricChange(currentValues.ctr, previousValues.ctr), format: "percent", tone: "cyan" },
    { label: "CPM", value: currentValues.cpm ?? 0, delta: inverse(metricChange(currentValues.cpm, previousValues.cpm)), format: "currency", tone: "orange" },
    { label: "CPC", value: currentValues.cpc ?? 0, delta: inverse(metricChange(currentValues.cpc, previousValues.cpc)), format: "currency", tone: "green" }
  ];
}

function buildHourlyPerformance(rows: MetaInsightRow[], primaryKpi: PrimaryKpiId): HourlyPerformancePoint[] {
  const byHour = new Map<number, number | null>();

  for (const row of rows) {
    const rawHour = parseInt(row.hourly_stats_aggregated_by_advertiser_time_zone || "0", 10);
    const value = metaMetrics(row)[primaryKpi];
    const current = byHour.get(rawHour);
    byHour.set(rawHour, value == null ? current ?? null : (current ?? 0) + value);
  }

  const values = [...byHour.values()].filter((value): value is number => value != null);
  const maxValue = Math.max(...values, 0);

  return Array.from({ length: 24 }, (_, hour) => {
    const value = byHour.get(hour) ?? null;
    const ratio = maxValue > 0 && value != null ? value / maxValue : 0;

    return {
      label: `${String(hour).padStart(2, "0")}h`,
      value,
      metricId: primaryKpi,
      highlight: ratio > 0.8 ? "high" : ratio > 0.5 ? "medium" : "base"
    };
  });
}

function buildAgeAudience(rows: MetaInsightRow[], primaryKpi: PrimaryKpiId): AgeAudiencePoint[] {
  const grouped = new Map<string, number | null>();

  for (const row of rows) {
    const label = row.age || "—";
    const value = metaMetrics(row)[primaryKpi];
    const current = grouped.get(label);
    grouped.set(label, value == null ? current ?? null : (current ?? 0) + value);
  }

  return [...grouped.entries()]
    .map(([label, value]) => ({ label, value, metricId: primaryKpi }))
    .sort((first, second) => first.label.localeCompare(second.label, "pt-BR"));
}

function buildGenderAudience(rows: MetaInsightRow[], primaryKpi: PrimaryKpiId): GenderAudiencePoint[] {
  const grouped = new Map<string, number | null>([
    ["Masculino", null],
    ["Feminino", null],
    ["Desconhecido", null]
  ]);

  for (const row of rows) {
    const normalized = String(row.gender || "").toLowerCase();
    const label = normalized === "male" ? "Masculino" : normalized === "female" ? "Feminino" : "Desconhecido";
    const value = metaMetrics(row)[primaryKpi];
    const current = grouped.get(label);
    grouped.set(label, value == null ? current ?? null : (current ?? 0) + value);
  }

  const total = [...grouped.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return [...grouped.entries()].map(([label, value]) => ({
    label,
    value,
    metricId: primaryKpi,
    percentage: total > 0 && value != null ? (value / total) * 100 : 0
  }));
}

function normalizeAdType(objectType?: string, adName?: string): AdItem["type"] {
  const normalizedObjectType = String(objectType || "").toUpperCase();
  const normalizedName = String(adName || "").toLowerCase();

  if (normalizedObjectType === "VIDEO" || normalizedName.includes("video")) {
    return "video";
  }

  if (normalizedObjectType === "LINK" && normalizedName.includes("carousel")) {
    return "carousel";
  }

  return "image";
}

export async function fetchGraph<T>(path: string, params: Record<string, string>, accessToken: string) {
  const searchParams = new URLSearchParams({
    ...params,
    access_token: accessToken
  });

  const started = Date.now();
  let result: Record<string, unknown> | undefined;
  for(let page=0;page<50;page++) {
    const remaining=25000-(Date.now()-started);
    if(remaining<=0) throw new Error("A consulta excedeu o tempo disponível. Nenhum resultado parcial foi salvo.");
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}?${searchParams.toString()}`, {
      cache:"no-store", signal:AbortSignal.timeout(Math.min(15000,remaining)), headers:{Accept:"application/json"}
    });
    const payload=await response.json();
    if(!response.ok) throw new Error(typeof payload?.error?.message==="string" ? payload.error.message : "Falha ao buscar dados da Meta.");
    if(!result) result=payload;
    else if(Array.isArray(result.data)&&Array.isArray(payload.data)) result.data.push(...payload.data);
    if(!payload.paging?.next) return result as T;
    if(!payload.paging?.cursors?.after) throw new Error("A Meta não forneceu o cursor da próxima página. Nenhum resultado parcial foi salvo.");
    searchParams.set("after",payload.paging.cursors.after);
  }
  throw new Error("Volume acima do limite desta consulta. Selecione um período menor.");
}

async function getMetaSession(): Promise<MetaSessionInfo> {
  const sessionToken = await readMetaSessionToken();
  if (!sessionToken) {
    throw new Error("Nenhuma sessao ativa da Meta foi encontrada.");
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new Error("Supabase server nao configurado.");
  }

  const { data, error } = await admin
    .from("meta_integration_sessions")
    .select("access_token, selected_account_ids, accounts")
    .eq("session_token", sessionToken).eq("user_id", await requireMetaUser())
    .maybeSingle();

  if (error || !data?.access_token) {
    throw new Error("A conexao da Meta nao possui token disponivel.");
  }

  const row = data as MetaSessionRow;
  return {
    accessToken: row.access_token!,
    selectedAccountIds: row.selected_account_ids,
    accounts: row.accounts ?? [],
  };
}

function ensureAccountAllowed(accountId: string, selectedAccountIds: string[]) {
  const normalized = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  return selectedAccountIds.includes(normalized);
}

export async function fetchMetaDashboardData(
  accountId: string,
  period: PeriodKey,
  primaryKpi: PrimaryKpiId,
  customRange?: { since?: string | null; until?: string | null; compareSince?: string | null; compareUntil?: string | null }
): Promise<DashboardDataBundle> {
  const session = await getMetaSession();
  const normalizedAccountId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  if (!ensureAccountAllowed(normalizedAccountId, session.selectedAccountIds)) {
    throw new Error("Essa conta nao esta liberada na integracao atual da Meta.");
  }

  const accessToken = session.accessToken;
  const storedAccount = session.accounts.find((account) => account.id === normalizedAccountId || account.accountId === normalizedAccountId.replace(/^act_/, ""));
  let timezone = storedAccount?.timezoneName;
  let currency = storedAccount?.currency;
  if (!timezone || !currency) {
    const account = await fetchGraph<{ timezone_name?: string; currency?: string }>(normalizedAccountId, { fields: "timezone_name,currency" }, accessToken);
    timezone = account.timezone_name;
    currency = account.currency;
  }
  timezone ||= "UTC";
  currency ||= "BRL";
  const today = new Date().toISOString().slice(0, 10);
  const effective = resolvePeriod(
    period,
    timezone,
    { since: customRange?.since ?? today, until: customRange?.until ?? today },
    customRange?.compareSince && customRange?.compareUntil ? "custom" : "previous",
    { since: customRange?.compareSince ?? undefined, until: customRange?.compareUntil ?? undefined },
  );
  const previousStart = effective.compare_since!;
  const previousEnd = effective.compare_until!;

  const [currentInsightsPayload, previousInsightsPayload, dailyInsightsPayload, hourlyInsightsPayload, audienceInsightsPayload, campaignsPayload, campaignInsightsPayload] =
    await Promise.all([
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "spend,impressions,reach,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas",
          ...buildTimeRangeParams(effective.since, effective.until)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "spend,impressions,reach,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas",
          ...buildTimeRangeParams(previousStart, previousEnd)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "date_start,spend,clicks,actions,action_values",
          time_increment: "1",
          ...buildTimeRangeParams(effective.since, effective.until)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "spend,impressions,reach,clicks,actions,action_values",
          breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
          limit: "200",
          ...buildTimeRangeParams(effective.since, effective.until)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "spend,impressions,reach,clicks,actions,action_values",
          breakdowns: "age,gender",
          limit: "200",
          ...buildTimeRangeParams(effective.since, effective.until)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaCampaignRow[] }>(
        `${normalizedAccountId}/campaigns`,
        {
          fields: "id,name,status,objective",
          limit: "200"
        },
        accessToken
      ),
      fetchGraph<{ data: MetaCampaignInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values",
          level: "campaign",
          limit: "200",
          ...buildTimeRangeParams(effective.since, effective.until)
        },
        accessToken
      )
    ]);

  const current = currentInsightsPayload.data[0];
  const previous = previousInsightsPayload.data[0];
  const campaignMeta = new Map(campaignsPayload.data.map((campaign) => [campaign.id, campaign]));
  const projection = adaptLegacyMeta({
    current,
    previous,
    daily: dailyInsightsPayload.data,
    campaigns: campaignInsightsPayload.data.map((row) => ({
      ...row,
      campaign_name: campaignMeta.get(row.campaign_id)?.name ?? row.campaign_name,
      objective: formatObjective(campaignMeta.get(row.campaign_id)?.objective),
    })),
  }, primaryKpi);
  const currentValues = projection.current;
  const previousValues = projection.previous;
  const primary = primaryMetricSnapshot(current, previous, primaryKpi);
  const spend = currentValues.spend ?? 0;
  const spendDelta = metricChange(currentValues.spend, previousValues.spend);
  const resultValue = primary.currentValue;
  const resultDelta = primary.delta;
  const revenue = currentValues.revenue ?? 0;
  const revenueDelta = metricChange(currentValues.revenue, previousValues.revenue);
  const roas = currentValues.roas ?? 0;
  const roasDelta = metricChange(currentValues.roas, previousValues.roas);
  const primaryCost = currentValues.spend == null || resultValue == null || resultValue === 0 ? null : currentValues.spend / resultValue;
  const previousPrimaryCost = previousValues.spend == null || primary.previousValue == null || primary.previousValue === 0 ? null : previousValues.spend / primary.previousValue;
  const primaryCostDelta = metricChange(primaryCost, previousPrimaryCost);
  const primaryCostMeta = primaryCostDefinition(primaryKpi);

  const dailySeries: DailyPoint[] = projection.series.map((row) => {
    return {
      label: row.date
        ? new Date(`${row.date}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : "--",
      spend: row.metrics.spend ?? 0,
      result: row.value,
      metricId: primaryKpi,
      revenue: row.metrics.revenue ?? undefined,
    };
  });

  const campaigns: CampaignMetric[] = campaignInsightsPayload.data
    .map((row) => {
      const metaCampaign = campaignMeta.get(row.campaign_id);
      const projected = projection.campaigns.find((item) => item.id === row.campaign_id)!;
      const values = projected.metrics;
      const campaignSpend = values.spend ?? 0;

      return {
        id: row.campaign_id,
        name: metaCampaign?.name || row.campaign_name || row.campaign_id,
        status: normalizeCampaignStatus(metaCampaign?.status) as CampaignMetric["status"],
        objective: formatObjective(metaCampaign?.objective),
        resultLabel: METRICS[primaryKpi].label,
        metricId: primaryKpi,
        metrics: values,
        spend: campaignSpend,
        reach: values.reach,
        impressions: values.impressions ?? undefined,
        clicks: values.clicks ?? undefined,
        purchases: values.purchases ?? undefined,
        followers: values.followers ?? undefined,
        ctr: values.ctr ?? 0,
        roas: values.roas ?? 0,
        result: values[primaryKpi],
      };
    })
    .sort((first, second) => second.spend - first.spend);

  const mediaMetrics = buildMediaMetrics(current, previous);
  const objectiveDistribution: ObjectiveDistributionItem[] = projection.objectiveDistribution.map((item) => ({
    ...item,
    valueLabel: "Investimento",
  }));
  const hourlyPerformance = buildHourlyPerformance(hourlyInsightsPayload.data, primaryKpi);
  const ageAudience = buildAgeAudience(audienceInsightsPayload.data, primaryKpi);
  const genderAudience = buildGenderAudience(audienceInsightsPayload.data, primaryKpi);
  const healthScore = buildHealthScore(spend, resultValue, roas, primaryCost, resultDelta, roasDelta, primaryKpi);
  const health = buildHealthLabel(healthScore);
  const funnel = buildFunnel(current);
  const bestCampaign = [...campaigns].sort((first, second) => second.roas - first.roas)[0];

  const snapshot: DashboardSnapshot = {
    primaryMetricId: primaryKpi,
    spend,
    spendDelta,
    resultLabel: METRICS[primaryKpi].label,
    resultValue,
    resultDelta,
    revenue,
    revenueDelta,
    roas,
    roasDelta,
    primaryCostLabel: primaryCostMeta.label,
    primaryCost,
    primaryCostDelta,
    quickInsights: buildQuickInsights(current, previous, primaryKpi),
    alerts: buildAlerts(spendDelta, resultDelta, primaryCostDelta, roasDelta, roas, primaryCostMeta.label, primaryKpi),
    healthScore,
    healthLabel: health.label,
    healthTone: health.tone,
    funnel,
    bottleneck:
      funnel.length >= 4
        ? `Maior perda observada entre ${funnel[Math.max(0, funnel.length - 3)].label.toLowerCase()} e ${funnel[funnel.length - 1].label.toLowerCase()}.`
        : "Dados insuficientes para detectar gargalo do funil.",
    strength: bestCampaign
      ? `${bestCampaign.name} aparece como principal destaque no periodo atual.`
      : "Ainda nao ha campanhas suficientes para destacar um ponto forte."
  };

  return {
    primaryMetricId: primaryKpi,
    timezone,
    currency,
    effectivePeriod: {
      since: effective.since,
      until: effective.until,
      compareSince: previousStart,
      compareUntil: previousEnd,
    },
    snapshot,
    dailySeries,
    campaigns,
    mediaMetrics,
    objectiveDistribution,
    hourlyPerformance,
    ageAudience,
    genderAudience
  };
}

export async function fetchMetaCampaignAds(
  campaignId: string,
  period: PeriodKey,
  customRange?: { since?: string | null; until?: string | null }
): Promise<AdItem[]> {
  const session = await getMetaSession();
  const accessToken = session.accessToken;
  const normalizedCampaignId = campaignId.replace(/^cmp_/, "");

  const campaign = await fetchGraph<{account_id:string}>(normalizedCampaignId, {fields:"account_id"}, accessToken);
  if (!ensureAccountAllowed(campaign.account_id, session.selectedAccountIds)) throw new Error("Campanha não autorizada.");
  const normalizedAccountId = campaign.account_id.startsWith("act_") ? campaign.account_id : `act_${campaign.account_id}`;
  const storedAccount = session.accounts.find((account) => account.id === normalizedAccountId || account.accountId === campaign.account_id);
  const timezone = storedAccount?.timezoneName ?? "UTC";
  const today = new Date().toISOString().slice(0, 10);
  const effective = resolvePeriod(period, timezone, {
    since: customRange?.since ?? today,
    until: customRange?.until ?? today,
  });
  const [insightsPayload, creativesPayload] = await Promise.all([
    fetchGraph<{ data: MetaAdInsightRow[] }>(
      `${normalizedCampaignId}/insights`,
      {
        fields: "ad_id,ad_name,ctr,cpc,spend,impressions",
        level: "ad",
        limit: "100",
        ...buildTimeRangeParams(effective.since, effective.until)
      },
      accessToken
    ),
    fetchGraph<{ data: MetaAdCreativeRow[] }>(
      `${normalizedCampaignId}/ads`,
      {
        fields: "id,name,creative{object_type,thumbnail_url}",
        limit: "100"
      },
      accessToken
    )
  ]);

  const creativeMap = new Map(creativesPayload.data.map((item) => [item.id, item]));
  const ranked = [...insightsPayload.data].sort((first, second) => parseNumber(second.ctr) - parseNumber(first.ctr));
  const topIds = new Set(ranked.slice(0, 2).map((row) => row.ad_id));
  const lowIds = ranked.length >= 4 ? new Set(ranked.slice(-2).map((row) => row.ad_id)) : new Set<string>();

  return ranked.map((row) => {
    const creative = creativeMap.get(row.ad_id);
    return {
      id: row.ad_id,
      name: row.ad_name || creative?.name || "Anuncio sem nome",
      type: normalizeAdType(creative?.creative?.object_type, row.ad_name),
      ctr: parseNumber(row.ctr),
      cpc: parseNumber(row.cpc),
      spend: parseNumber(row.spend),
      impressions: parseNumber(row.impressions),
      thumbnailUrl: creative?.creative?.thumbnail_url,
      top: topIds.has(row.ad_id),
      lowPerformer: lowIds.has(row.ad_id) && !topIds.has(row.ad_id)
    };
  });
}
