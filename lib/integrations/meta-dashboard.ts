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

type PeriodKey = "last_7d" | "last_30d" | "last_90d" | "custom";

type MetaInsightAction = {
  action_type: string;
  value: string;
};

type MetaInsightRow = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
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
};

interface MetaSessionInfo {
  accessToken: string;
  selectedAccountIds: string[];
}

const META_GRAPH_VERSION = "v22.0";

function parseNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function subDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseISODate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPeriodWindow(period: PeriodKey, customRange?: { since?: string | null; until?: string | null }) {
  const today = new Date();
  const customSince = period === "custom" ? parseISODate(customRange?.since) : null;
  const customUntil = period === "custom" ? parseISODate(customRange?.until) : null;
  const hasValidCustomRange = Boolean(customSince && customUntil && customSince <= customUntil);
  const days =
    hasValidCustomRange && customSince && customUntil
      ? Math.max(1, Math.round((startOfDay(customUntil).getTime() - startOfDay(customSince).getTime()) / 86_400_000) + 1)
      : period === "last_7d"
        ? 7
        : period === "last_90d"
          ? 90
          : 30;
  const currentEnd = endOfDay(hasValidCustomRange && customUntil ? customUntil : today);
  const currentStart = startOfDay(hasValidCustomRange && customSince ? customSince : subDays(today, days - 1));
  const previousEnd = endOfDay(subDays(currentStart, 1));
  const previousStart = startOfDay(subDays(previousEnd, days - 1));

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd
  };
}

function buildTimeRangeParams(start: Date, end: Date) {
  return {
    time_range: JSON.stringify({
      since: formatISODate(start),
      until: formatISODate(end)
    })
  };
}

function getActionValue(actions: MetaInsightAction[] | undefined, candidates: string[]) {
  if (!actions?.length) return 0;

  for (const candidate of candidates) {
    const match = actions.find((action) => action.action_type === candidate);
    if (match) {
      return parseNumber(match.value);
    }
  }

  return 0;
}

function getLinkClicks(row: MetaInsightRow | undefined) {
  return getActionValue(row?.actions, ["link_click", "outbound_click"]);
}

function getPurchaseCount(row: MetaInsightRow | undefined) {
  return getActionValue(row?.actions, [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase"
  ]);
}

function getProfileVisits(row: MetaInsightRow | undefined) {
  return getActionValue(row?.actions, [
    "profile_visit",
    "profile_visits",
    "instagram_profile_visit",
    "ig_profile_visit",
    "ig_profile_visits"
  ]);
}

function getFollowersCount(row: MetaInsightRow | undefined) {
  return getActionValue(row?.actions, [
    "follow",
    "follows",
    "instagram_follow",
    "ig_follow",
    "page_like",
    "like"
  ]);
}

function getResultMetric(row: MetaInsightRow | undefined) {
  const purchaseCount = getPurchaseCount(row);
  if (purchaseCount > 0) {
    return { label: "Vendas", value: purchaseCount };
  }

  const messageCount = getActionValue(row?.actions, [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d"
  ]);
  if (messageCount > 0) {
    return { label: "Conversas", value: messageCount };
  }

  const leadCount = getActionValue(row?.actions, ["lead", "onsite_conversion.lead_grouped"]);
  if (leadCount > 0) {
    return { label: "Leads", value: leadCount };
  }

  const profileVisits = getProfileVisits(row);
  if (profileVisits > 0) {
    return { label: "Visitas ao perfil", value: profileVisits };
  }

  const linkClicks = getLinkClicks(row);
  if (linkClicks > 0) {
    return { label: "Cliques no link", value: linkClicks };
  }

  const landingPageViews = getActionValue(row?.actions, ["landing_page_view"]);
  if (landingPageViews > 0) {
    return { label: "Landing page views", value: landingPageViews };
  }

  return { label: "Resultados", value: 0 };
}

function getRevenueValue(row: MetaInsightRow | undefined) {
  return getActionValue(row?.action_values, [
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase"
  ]);
}

function getRoasValue(row: MetaInsightRow | undefined, spend: number, revenue: number) {
  if (spend > 0 && revenue > 0) {
    return revenue / spend;
  }

  return parseNumber(row?.purchase_roas?.[0]?.value);
}

function getDelta(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
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

function buildHealthScore(spend: number, resultValue: number, roas: number, cpa: number, resultDelta: number, roasDelta: number) {
  let score = 55;
  score += clamp(roas * 10, 0, 25);
  score += clamp(resultDelta / 4, -12, 12);
  score += clamp(roasDelta / 5, -10, 10);
  score -= clamp(cpa / 8, 0, 18);
  score += spend > 0 ? 6 : -6;
  score += resultValue > 0 ? 8 : -12;

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
  const clicks = parseNumber(row?.clicks);
  const landingPageViews = getActionValue(row?.actions, ["landing_page_view"]);
  const initiatedCheckouts = getActionValue(row?.actions, ["initiate_checkout", "omni_initiated_checkout"]);
  const purchases = getPurchaseCount(row);

  return ([
    { label: "Cliques", value: clicks, color: "indigo" },
    { label: "Page views", value: landingPageViews, color: "purple" },
    { label: "Checkout iniciado", value: initiatedCheckouts, color: "orange" },
    { label: "Vendas", value: purchases, color: "green" }
  ] satisfies FunnelStep[]).filter((step) => step.value > 0);
}

function buildAlerts(spendDelta: number, resultDelta: number, cpaDelta: number, roasDelta: number, roas: number): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (spendDelta > 5 && resultDelta < 0) {
    alerts.push({
      id: "spend_result",
      title: "Investimento subiu e resultado caiu",
      description: "A conta ganhou gasto, mas a entrega final perdeu tracao no periodo atual.",
      tone: "high"
    });
  }

  if (cpaDelta > 15) {
    alerts.push({
      id: "cpa_pressure",
      title: "CPA piorou acima do ideal",
      description: "Vale revisar criativos, publico e posicionamentos antes de ampliar a verba.",
      tone: "warning"
    });
  }

  if (roasDelta < -10) {
    alerts.push({
      id: "roas_drop",
      title: "ROAS caiu no comparativo",
      description: "O retorno da conta desacelerou frente ao periodo anterior.",
      tone: "high"
    });
  }

  if (roas >= 3) {
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

function buildQuickInsights(current: MetaInsightRow | undefined, previous: MetaInsightRow | undefined, resultLabel: string, resultValue: number) {
  const spend = parseNumber(current?.spend);
  const previousSpend = parseNumber(previous?.spend);
  const spendDelta = getDelta(spend, previousSpend);
  const previousResult = getResultMetric(previous).value;
  const resultDelta = getDelta(resultValue, previousResult);
  const ctr = parseNumber(current?.ctr);
  const previousCtr = parseNumber(previous?.ctr);
  const ctrDelta = getDelta(ctr, previousCtr);

  return [
    {
      label: "O que aconteceu",
      title: `Investimento ${spendDelta >= 0 ? "subiu" : "caiu"} ${Math.abs(spendDelta).toFixed(1)}% e ${resultLabel.toLowerCase()} ${resultDelta >= 0 ? "subiu" : "caiu"} ${Math.abs(resultDelta).toFixed(1)}%.`,
      description: "Comparativo automatico da janela atual contra a janela anterior com a mesma duracao.",
      tone: "blue" as const
    },
    {
      label: "Por que importa",
      title: `CTR ${ctrDelta >= 0 ? "melhorou" : "piorou"} ${Math.abs(ctrDelta).toFixed(1)}% no periodo.`,
      description: "A taxa de clique ajuda a identificar cedo quando a conta esta ganhando ou perdendo tracao.",
      tone: "orange" as const
    },
    {
      label: "Proxima acao",
      title: resultDelta < 0 ? "Prioridade em revisar campanhas com maior custo e menor retorno." : "Mapear as campanhas mais eficientes para escalar com seguranca.",
      description: "O painel cruza conta ativa, campanhas e comparativo para acelerar a decisao.",
      tone: "green" as const
    }
  ];
}

function buildMediaMetrics(current: MetaInsightRow | undefined, previous: MetaInsightRow | undefined): MediaMetricCard[] {
  const currentReach = parseNumber(current?.reach);
  const previousReach = parseNumber(previous?.reach);
  const currentLinkClicks = getLinkClicks(current);
  const previousLinkClicks = getLinkClicks(previous);
  const currentCtr = parseNumber(current?.ctr);
  const previousCtr = parseNumber(previous?.ctr);
  const currentCpm = parseNumber(current?.cpm);
  const previousCpm = parseNumber(previous?.cpm);
  const currentSpend = parseNumber(current?.spend);
  const previousSpend = parseNumber(previous?.spend);
  const currentCpc = currentLinkClicks > 0 ? currentSpend / currentLinkClicks : parseNumber(current?.cpc);
  const previousCpc = previousLinkClicks > 0 ? previousSpend / previousLinkClicks : parseNumber(previous?.cpc);

  return [
    { label: "Alcance", value: currentReach, delta: getDelta(currentReach, previousReach), format: "compact", tone: "purple" },
    { label: "Cliques no Link", value: currentLinkClicks, delta: getDelta(currentLinkClicks, previousLinkClicks), format: "compact", tone: "blue" },
    { label: "CTR", value: currentCtr, delta: getDelta(currentCtr, previousCtr), format: "percent", tone: "cyan" },
    { label: "CPM", value: currentCpm, delta: previousCpm > 0 ? getDelta(currentCpm, previousCpm) * -1 : null, format: "currency", tone: "orange" },
    { label: "CPC", value: currentCpc, delta: previousCpc > 0 ? getDelta(currentCpc, previousCpc) * -1 : null, format: "currency", tone: "green" }
  ];
}

function getCampaignObjectiveMetric(campaign: CampaignMetric) {
  const objective = campaign.objective.toLowerCase();

  if (objective.includes("venda")) {
    return { label: "Vendas", value: campaign.purchases ?? campaign.result };
  }

  if (objective.includes("trafego") || objective.includes("reconhecimento") || objective.includes("alcance")) {
    return { label: "Cliques", value: campaign.clicks ?? campaign.result };
  }

  if (objective.includes("mensagem")) {
    return { label: "Conversas", value: campaign.result };
  }

  if (objective.includes("lead")) {
    return { label: "Leads", value: campaign.result };
  }

  if (objective.includes("engajamento")) {
    return { label: "Engajamentos", value: campaign.result };
  }

  return { label: "Resultados", value: campaign.result };
}

function buildObjectiveDistribution(campaigns: CampaignMetric[]): ObjectiveDistributionItem[] {
  const grouped = new Map<string, { value: number; valueLabel: string }>();

  for (const campaign of campaigns) {
    const metric = getCampaignObjectiveMetric(campaign);
    const current = grouped.get(campaign.objective) || { value: 0, valueLabel: metric.label };
    grouped.set(campaign.objective, {
      value: current.value + metric.value,
      valueLabel: current.valueLabel
    });
  }

  const totalValue = [...grouped.values()].reduce((sum, item) => sum + item.value, 0);

  return [...grouped.entries()]
    .map(([label, item]) => ({
      label,
      value: item.value,
      valueLabel: item.valueLabel,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0
    }))
    .sort((first, second) => second.value - first.value);
}

function buildHourlyPerformance(rows: MetaInsightRow[]): HourlyPerformancePoint[] {
  const byHour = new Map<number, number>();

  for (const row of rows) {
    const rawHour = parseInt(row.hourly_stats_aggregated_by_advertiser_time_zone || "0", 10);
    const value = getPurchaseCount(row) || getResultMetric(row).value || parseNumber(row.clicks);
    byHour.set(rawHour, (byHour.get(rawHour) || 0) + value);
  }

  const values = [...byHour.values()];
  const maxValue = Math.max(...values, 0);

  return Array.from({ length: 24 }, (_, hour) => {
    const value = byHour.get(hour) || 0;
    const ratio = maxValue > 0 ? value / maxValue : 0;

    return {
      label: `${String(hour).padStart(2, "0")}h`,
      value,
      highlight: ratio > 0.8 ? "high" : ratio > 0.5 ? "medium" : "base"
    };
  });
}

function buildAgeAudience(rows: MetaInsightRow[]): AgeAudiencePoint[] {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    const label = row.age || "—";
    grouped.set(label, (grouped.get(label) || 0) + getResultMetric(row).value);
  }

  return [...grouped.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((first, second) => first.label.localeCompare(second.label, "pt-BR"));
}

function buildGenderAudience(rows: MetaInsightRow[]): GenderAudiencePoint[] {
  const grouped = new Map<string, number>([
    ["Masculino", 0],
    ["Feminino", 0],
    ["Desconhecido", 0]
  ]);

  for (const row of rows) {
    const normalized = String(row.gender || "").toLowerCase();
    const label = normalized === "male" ? "Masculino" : normalized === "female" ? "Feminino" : "Desconhecido";
    grouped.set(label, (grouped.get(label) || 0) + getResultMetric(row).value);
  }

  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
  return [...grouped.entries()].map(([label, value]) => ({
    label,
    value,
    percentage: total > 0 ? (value / total) * 100 : 0
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

async function fetchGraph<T>(path: string, params: Record<string, string>, accessToken: string) {
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
    .select("access_token, selected_account_ids")
    .eq("session_token", sessionToken).eq("user_id", await requireMetaUser())
    .maybeSingle();

  if (error || !data?.access_token) {
    throw new Error("A conexao da Meta nao possui token disponivel.");
  }

  const row = data as MetaSessionRow;
  return {
    accessToken: row.access_token!,
    selectedAccountIds: row.selected_account_ids
  };
}

function ensureAccountAllowed(accountId: string, selectedAccountIds: string[]) {
  const normalized = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  return selectedAccountIds.includes(normalized);
}

export async function fetchMetaDashboardData(
  accountId: string,
  period: PeriodKey,
  customRange?: { since?: string | null; until?: string | null }
): Promise<DashboardDataBundle> {
  const session = await getMetaSession();
  const normalizedAccountId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  if (!ensureAccountAllowed(normalizedAccountId, session.selectedAccountIds)) {
    throw new Error("Essa conta nao esta liberada na integracao atual da Meta.");
  }

  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodWindow(period, customRange);
  const accessToken = session.accessToken;

  const [currentInsightsPayload, previousInsightsPayload, dailyInsightsPayload, hourlyInsightsPayload, audienceInsightsPayload, campaignsPayload, campaignInsightsPayload] =
    await Promise.all([
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "spend,impressions,reach,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas",
          ...buildTimeRangeParams(currentStart, currentEnd)
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
          ...buildTimeRangeParams(currentStart, currentEnd)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "clicks,actions",
          breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
          limit: "200",
          ...buildTimeRangeParams(currentStart, currentEnd)
        },
        accessToken
      ),
      fetchGraph<{ data: MetaInsightRow[] }>(
        `${normalizedAccountId}/insights`,
        {
          fields: "actions,clicks",
          breakdowns: "age,gender",
          limit: "200",
          ...buildTimeRangeParams(currentStart, currentEnd)
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
          fields: "campaign_id,campaign_name,spend,reach,clicks,ctr,actions,action_values,purchase_roas",
          level: "campaign",
          limit: "200",
          ...buildTimeRangeParams(currentStart, currentEnd)
        },
        accessToken
      )
    ]);

  const current = currentInsightsPayload.data[0];
  const previous = previousInsightsPayload.data[0];
  const spend = parseNumber(current?.spend);
  const previousSpend = parseNumber(previous?.spend);
  const spendDelta = getDelta(spend, previousSpend);

  const currentMetric = getResultMetric(current);
  const previousMetric = getResultMetric(previous);
  const resultValue = currentMetric.value;
  const resultDelta = getDelta(resultValue, previousMetric.value);

  const revenue = getRevenueValue(current);
  const previousRevenue = getRevenueValue(previous);
  const revenueDelta = getDelta(revenue, previousRevenue);

  const roas = getRoasValue(current, spend, revenue);
  const previousRoas = getRoasValue(previous, previousSpend, previousRevenue);
  const roasDelta = getDelta(roas, previousRoas);

  const cpa = resultValue > 0 ? spend / resultValue : 0;
  const previousCpa = previousMetric.value > 0 ? previousSpend / previousMetric.value : 0;
  const cpaDelta = getDelta(cpa, previousCpa);

  const dailySeries: DailyPoint[] = dailyInsightsPayload.data.map((row) => {
    const resultMetric = getResultMetric(row);
    return {
      label: row.date_start
        ? new Date(`${row.date_start}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        : "--",
      spend: parseNumber(row.spend),
      result: resultMetric.value,
      revenue: getRevenueValue(row)
    };
  });

  const campaignMeta = new Map(campaignsPayload.data.map((campaign) => [campaign.id, campaign]));
  const campaigns: CampaignMetric[] = campaignInsightsPayload.data
    .map((row) => {
      const metaCampaign = campaignMeta.get(row.campaign_id);
      const campaignSpend = parseNumber(row.spend);
      const campaignRevenue = getRevenueValue(row);
      const campaignPurchases = getPurchaseCount(row);
      const campaignMetric = getResultMetric(row);

      return {
        id: row.campaign_id,
        name: metaCampaign?.name || row.campaign_name || row.campaign_id,
        status: normalizeCampaignStatus(metaCampaign?.status) as CampaignMetric["status"],
        objective: formatObjective(metaCampaign?.objective),
        resultLabel: campaignMetric.label,
        spend: campaignSpend,
        reach: parseNumber(row.reach),
        impressions: parseNumber(row.impressions),
        clicks: parseNumber(row.clicks),
        purchases: campaignPurchases,
        followers: getFollowersCount(row),
        ctr: parseNumber(row.ctr),
        roas: getRoasValue(row, campaignSpend, campaignRevenue),
        result: campaignMetric.value
      };
    })
    .sort((first, second) => second.spend - first.spend);

  const mediaMetrics = buildMediaMetrics(current, previous);
  const objectiveDistribution = buildObjectiveDistribution(campaigns);
  const hourlyPerformance = buildHourlyPerformance(hourlyInsightsPayload.data);
  const ageAudience = buildAgeAudience(audienceInsightsPayload.data);
  const genderAudience = buildGenderAudience(audienceInsightsPayload.data);
  const healthScore = buildHealthScore(spend, resultValue, roas, cpa, resultDelta, roasDelta);
  const health = buildHealthLabel(healthScore);
  const funnel = buildFunnel(current);
  const bestCampaign = [...campaigns].sort((first, second) => second.roas - first.roas)[0];

  const snapshot: DashboardSnapshot = {
    spend,
    spendDelta,
    resultLabel: currentMetric.label,
    resultValue,
    resultDelta,
    revenue,
    revenueDelta,
    roas,
    roasDelta,
    cpa,
    cpaDelta,
    quickInsights: buildQuickInsights(current, previous, currentMetric.label, resultValue),
    alerts: buildAlerts(spendDelta, resultDelta, cpaDelta, roasDelta, roas),
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
  const { currentStart, currentEnd } = getPeriodWindow(period, customRange);
  const accessToken = session.accessToken;
  const normalizedCampaignId = campaignId.replace(/^cmp_/, "");

  const campaign = await fetchGraph<{account_id:string}>(normalizedCampaignId, {fields:"account_id"}, accessToken);
  if (!ensureAccountAllowed(campaign.account_id, session.selectedAccountIds)) throw new Error("Campanha não autorizada.");
  const [insightsPayload, creativesPayload] = await Promise.all([
    fetchGraph<{ data: MetaAdInsightRow[] }>(
      `${normalizedCampaignId}/insights`,
      {
        fields: "ad_id,ad_name,ctr,cpc,spend,impressions",
        level: "ad",
        limit: "100",
        ...buildTimeRangeParams(currentStart, currentEnd)
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
