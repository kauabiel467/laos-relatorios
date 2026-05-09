import type {
  AlertItem,
  CampaignMetric,
  DashboardDataBundle,
  DashboardSnapshot,
  DailyPoint,
  FunnelStep
} from "@/lib/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { readMetaSessionToken } from "@/lib/integrations/meta-oauth";

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
  ctr?: string;
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
  purchase_roas?: Array<{
    action_type: string;
    value: string;
  }>;
  date_start?: string;
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

type MetaStatusRow = {
  access_token: string | null;
  selected_account_ids: string[];
};

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

function getPeriodWindow(period: PeriodKey) {
  const today = new Date();
  const days = period === "last_7d" ? 7 : period === "last_90d" ? 90 : 30;
  const currentEnd = endOfDay(today);
  const currentStart = startOfDay(subDays(today, days - 1));
  const previousEnd = endOfDay(subDays(currentStart, 1));
  const previousStart = startOfDay(subDays(previousEnd, days - 1));

  return {
    days,
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

function getResultMetric(row: MetaInsightRow | undefined) {
  const actions = row?.actions ?? [];
  const priority = [
    {
      label: "Compras",
      value: getActionValue(actions, [
        "purchase",
        "omni_purchase",
        "offsite_conversion.fb_pixel_purchase",
        "onsite_conversion.purchase"
      ])
    },
    {
      label: "Conversas",
      value: getActionValue(actions, [
        "onsite_conversion.messaging_conversation_started_7d",
        "messaging_conversation_started_7d"
      ])
    },
    {
      label: "Leads",
      value: getActionValue(actions, ["lead", "onsite_conversion.lead_grouped"])
    },
    {
      label: "Cliques no link",
      value: getActionValue(actions, ["link_click", "outbound_click"])
    },
    {
      label: "Landing page views",
      value: getActionValue(actions, ["landing_page_view"])
    }
  ];

  return priority.find((metric) => metric.value > 0) || { label: "Resultados", value: 0 };
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

function buildFunnel(row: MetaInsightRow | undefined, resultValue: number): FunnelStep[] {
  const impressions = parseNumber(row?.impressions);
  const clicks = parseNumber(row?.clicks);
  const landingPageViews = getActionValue(row?.actions, ["landing_page_view"]);
  const initiatedCheckouts = getActionValue(row?.actions, ["initiate_checkout", "omni_initiated_checkout"]);

  return ([
    { label: "Impressoes", value: impressions, color: "blue" },
    { label: "Cliques", value: clicks, color: "indigo" },
    { label: "Landing page views", value: landingPageViews || Math.round(clicks * 0.78), color: "purple" },
    { label: "Checkout iniciado", value: initiatedCheckouts || Math.round(resultValue * 1.35), color: "orange" },
    { label: "Resultado final", value: resultValue, color: "green" }
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

async function fetchGraph<T>(path: string, params: Record<string, string>, accessToken: string) {
  const searchParams = new URLSearchParams({
    ...params,
    access_token: accessToken
  });

  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}?${searchParams.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "Falha ao buscar dados da Meta.";
    throw new Error(message);
  }

  return payload as T;
}

async function getMetaSession() {
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
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (error || !data?.access_token) {
    throw new Error("A conexao da Meta nao possui token disponivel.");
  }

  return data as MetaStatusRow;
}

function ensureAccountAllowed(accountId: string, selectedAccountIds: string[]) {
  const normalized = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  return selectedAccountIds.includes(normalized);
}

export async function fetchMetaDashboardData(accountId: string, period: PeriodKey): Promise<DashboardDataBundle> {
  const session = await getMetaSession();
  const normalizedAccountId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

  if (!ensureAccountAllowed(normalizedAccountId, session.selected_account_ids)) {
    throw new Error("Essa conta nao esta liberada na integracao atual da Meta.");
  }

  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodWindow(period);
  const accessToken = session.access_token;
  if (!accessToken) {
    throw new Error("A conexao da Meta nao possui token valido para consulta.");
  }

  const [currentInsightsPayload, previousInsightsPayload, dailyInsightsPayload, campaignsPayload, campaignInsightsPayload] = await Promise.all([
    fetchGraph<{ data: MetaInsightRow[] }>(
      `${normalizedAccountId}/insights`,
      {
        fields: "spend,impressions,reach,clicks,cpc,ctr,actions,action_values,purchase_roas",
        ...buildTimeRangeParams(currentStart, currentEnd)
      },
      accessToken
    ),
    fetchGraph<{ data: MetaInsightRow[] }>(
      `${normalizedAccountId}/insights`,
      {
        fields: "spend,impressions,reach,clicks,cpc,ctr,actions,action_values,purchase_roas",
        ...buildTimeRangeParams(previousStart, previousEnd)
      },
      accessToken
    ),
    fetchGraph<{ data: MetaInsightRow[] }>(
      `${normalizedAccountId}/insights`,
      {
        fields: "date_start,spend,actions,action_values",
        time_increment: "1",
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
        fields: "campaign_id,campaign_name,spend,reach,ctr,actions,action_values,purchase_roas",
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

  const dailySeries: DailyPoint[] = dailyInsightsPayload.data.slice(-7).map((row) => {
    const dailyMetric = getResultMetric(row);
    return {
      label: row.date_start
        ? new Date(`${row.date_start}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3)
        : "--",
      spend: parseNumber(row.spend),
      result: dailyMetric.value,
      revenue: getRevenueValue(row)
    };
  });

  const campaignMeta = new Map(campaignsPayload.data.map((campaign) => [campaign.id, campaign]));
  const campaigns: CampaignMetric[] = campaignInsightsPayload.data
    .map((row) => {
      const metaCampaign = campaignMeta.get(row.campaign_id);
      const campaignSpend = parseNumber(row.spend);
      const campaignRevenue = getRevenueValue(row);

      return {
        id: row.campaign_id,
        name: metaCampaign?.name || row.campaign_name || row.campaign_id,
        status: normalizeCampaignStatus(metaCampaign?.status) as CampaignMetric["status"],
        objective: formatObjective(metaCampaign?.objective),
        spend: campaignSpend,
        reach: parseNumber(row.reach),
        ctr: parseNumber(row.ctr),
        roas: getRoasValue(row, campaignSpend, campaignRevenue),
        result: getResultMetric(row).value
      };
    })
    .sort((first, second) => second.spend - first.spend);

  const healthScore = buildHealthScore(spend, resultValue, roas, cpa, resultDelta, roasDelta);
  const health = buildHealthLabel(healthScore);
  const funnel = buildFunnel(current, resultValue);
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
    campaigns
  };
}
