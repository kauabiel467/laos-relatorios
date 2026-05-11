"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdItem, CampaignMetric, Client, DashboardDataBundle, DashboardTab, MetaIntegrationStatus, PeriodKey } from "@/lib/types";
import { adsByCampaign, cardapio, clients, snapshot as snapshotFallback } from "@/lib/mocks";
import { formatCurrency, formatNumber, formatPercent, formatRoas } from "@/lib/utils/format";
import { AiPanel } from "./ai-panel";
import { CampaignDrawer } from "./campaign-drawer";
import { CampaignsTable } from "./campaigns-table";
import { CardapioModal } from "./cardapio-modal";
import { ConfigModal } from "./config-modal";
import { HeaderBar } from "./header-bar";
import { MediaMetricsSection } from "./media-metrics-section";
import { MetaIntegrationCard } from "./meta-integration-card";
import { MetaIntegrationModal } from "./meta-integration-modal";
import { MetaVisualsSection } from "./meta-visuals-section";
import { MetricCard } from "./metric-card";
import { QuickInsightsSection } from "./quick-insights-section";
import { SectionTitle } from "./section-title";
import { TabsNav } from "./tabs-nav";
import { TeamSettingsModal } from "./team-settings-modal";

const emptyMetaSnapshot: DashboardDataBundle["snapshot"] = {
  spend: 0,
  spendDelta: 0,
  resultLabel: "Resultados",
  resultValue: 0,
  resultDelta: 0,
  revenue: 0,
  revenueDelta: 0,
  roas: 0,
  roasDelta: 0,
  cpa: 0,
  cpaDelta: 0,
  quickInsights: [
    {
      label: "O que aconteceu",
      title: "Ainda nao ha dados carregados para esta conta.",
      description: "Conecte a Meta e selecione uma conta com historico no periodo para preencher o resumo automatico.",
      tone: "blue"
    },
    {
      label: "Por que importa",
      title: "Sem dados reais, o painel nao consegue diagnosticar a conta.",
      description: "Assim que a API retornar investimento e resultados, essa leitura passa a ser automatica.",
      tone: "orange"
    },
    {
      label: "Proxima acao",
      title: "Valide a conta conectada e o periodo selecionado.",
      description: "Se a conta estiver correta, o dashboard carrega os indicadores reais desta selecao.",
      tone: "green"
    }
  ],
  alerts: [
    {
      id: "empty",
      title: "Aguardando dados da Meta",
      description: "Nao ha metrica suficiente para gerar alertas desta conta neste momento.",
      tone: "neutral"
    }
  ],
  healthScore: 0,
  healthLabel: "Aguardando dados",
  healthTone: "yellow",
  funnel: [],
  bottleneck: "Ainda nao foi possivel calcular gargalos para esta conta.",
  strength: "Ainda nao ha campanhas suficientes para destacar um ponto forte."
};

const emptyDailySeries: DashboardDataBundle["dailySeries"] = [];
const emptyMediaMetrics: DashboardDataBundle["mediaMetrics"] = [];
const emptyObjectiveDistribution: DashboardDataBundle["objectiveDistribution"] = [];
const emptyHourlyPerformance: DashboardDataBundle["hourlyPerformance"] = [];
const emptyAgeAudience: DashboardDataBundle["ageAudience"] = [];
const emptyGenderAudience: DashboardDataBundle["genderAudience"] = [];

type MetricDrillType = "spend" | "result" | "revenue" | "roas" | "cpa";
type MetaView = "sales" | "awareness" | "messages";

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultCustomRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return {
    start: formatDateInput(start),
    end: formatDateInput(end)
  };
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  });
}

function getPeriodRange(period: PeriodKey, customRange: { start: string; end: string }) {
  if (period === "custom") {
    return customRange;
  }

  const end = new Date();
  const start = new Date(end);
  const daysMap: Record<Exclude<PeriodKey, "custom">, number> = {
    last_7d: 6,
    last_30d: 29,
    last_90d: 89
  };

  start.setDate(end.getDate() - daysMap[period]);

  return {
    start: formatDateInput(start),
    end: formatDateInput(end)
  };
}

function isSalesCampaign(campaign: CampaignMetric) {
  return campaign.objective.toLowerCase().includes("venda");
}

function isAwarenessCampaign(campaign: CampaignMetric) {
  const objective = campaign.objective.toLowerCase();
  return (
    objective.includes("engajamento") ||
    objective.includes("reconhecimento") ||
    objective.includes("alcance") ||
    objective.includes("trafego") ||
    objective.includes("seguidores")
  );
}

function isMessagesCampaign(campaign: CampaignMetric) {
  return campaign.resultLabel.toLowerCase().includes("conversa") || campaign.objective.toLowerCase().includes("mensagem");
}

interface DashboardAppProps {
  requiresWorkspaceSetup?: boolean;
}

export function DashboardApp({ requiresWorkspaceSetup = false }: DashboardAppProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>("meta");
  const [metaView, setMetaView] = useState<MetaView>("sales");
  const [period, setPeriod] = useState<PeriodKey>("last_30d");
  const [customRange, setCustomRange] = useState(getDefaultCustomRange);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client>(clients[0]);
  const [campaignFilter, setCampaignFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [sortColumn, setSortColumn] = useState<keyof CampaignMetric>("spend");
  const [sortDirection, setSortDirection] = useState<1 | -1>(-1);
  const [configOpen, setConfigOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [cardapioOpen, setCardapioOpen] = useState(false);
  const [drawerCampaign, setDrawerCampaign] = useState<CampaignMetric | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaStatus, setMetaStatus] = useState<MetaIntegrationStatus | null>(null);
  const [metaPending, setMetaPending] = useState(false);
  const [metaFeedback, setMetaFeedback] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardDataBundle | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [campaignAds, setCampaignAds] = useState<AdItem[]>([]);
  const [campaignAdsLoading, setCampaignAdsLoading] = useState(false);
  const [campaignAdsError, setCampaignAdsError] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [metricDrilldown, setMetricDrilldown] = useState<MetricDrillType | null>(null);
  const [aiMessages, setAiMessages] = useState<string[]>([
    "Ola! Sou sua analista de Meta Ads da Laos Assessoria. Conecte sua conta e pergunte sobre metricas, criativos ou otimizacoes."
  ]);

  useEffect(() => {
    if (requiresWorkspaceSetup) {
      setTeamOpen(true);
    }
  }, [requiresWorkspaceSetup]);

  const availableClients = useMemo<Client[]>(() => {
    if (metaStatus?.stage === "connected" && metaStatus.accounts.length) {
      return metaStatus.accounts.map((account) => ({
        id: `act_${account.accountId}`,
        name: account.name,
        status: account.status === "1" ? "ACTIVE" : "PAUSED",
        objective: "SALES"
      }));
    }

    return clients;
  }, [metaStatus]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return availableClients;
    return availableClients.filter((client) => `${client.name} ${client.id}`.toLowerCase().includes(term));
  }, [availableClients, search]);

  const shouldUseMockMeta = metaStatus?.stage !== "connected";
  const resolvedSnapshot = dashboardData?.snapshot ?? (shouldUseMockMeta ? snapshotFallback : emptyMetaSnapshot);
  const resolvedDailySeries = dashboardData?.dailySeries ?? emptyDailySeries;
  const resolvedMediaMetrics = dashboardData?.mediaMetrics ?? emptyMediaMetrics;
  const resolvedObjectiveDistribution = dashboardData?.objectiveDistribution ?? emptyObjectiveDistribution;
  const resolvedHourlyPerformance = dashboardData?.hourlyPerformance ?? emptyHourlyPerformance;
  const resolvedAgeAudience = dashboardData?.ageAudience ?? emptyAgeAudience;
  const resolvedGenderAudience = dashboardData?.genderAudience ?? emptyGenderAudience;
  const linkClicks = useMemo(() => {
    const clicksMetric = resolvedMediaMetrics.find((metric) => metric.label.toLowerCase().includes("cliques no link"))?.value;
    if (typeof clicksMetric === "number" && clicksMetric > 0) {
      return clicksMetric;
    }

    return (dashboardData?.campaigns ?? []).reduce((sum, campaign) => sum + (campaign.clicks ?? 0), 0);
  }, [dashboardData?.campaigns, resolvedMediaMetrics]);
  const clientTicket = resolvedSnapshot.resultValue > 0 ? resolvedSnapshot.revenue / resolvedSnapshot.resultValue : 0;
  const clientConversionRate = linkClicks > 0 ? (resolvedSnapshot.resultValue / linkClicks) * 100 : 0;
  const objectiveMatcher = useMemo(
    () =>
      ({
        sales: isSalesCampaign,
        awareness: isAwarenessCampaign,
        messages: isMessagesCampaign
      })[metaView],
    [metaView]
  );

  const drilldownContent = useMemo(() => {
    if (!metricDrilldown) return null;

    const campaigns = dashboardData?.campaigns ?? [];
    const dailyCount = Math.max(resolvedDailySeries.length, 1);
    const totalResult = Math.max(resolvedSnapshot.resultValue, 0);
    const totalSpend = Math.max(resolvedSnapshot.spend, 0);
    const totalRevenue = Math.max(resolvedSnapshot.revenue, 0);

    const config = {
      spend: {
        title: "Detalhamento - Investimento",
        accent: "#3b82f6",
        label: "Investimento (R$)",
        values: resolvedDailySeries.map((item) => item.spend),
        stats: [
          { label: "Total", value: formatCurrency(totalSpend) },
          { label: "Media diaria", value: formatCurrency(totalSpend / dailyCount) }
        ],
        rows: [...campaigns]
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 5)
          .map((campaign) => ({ name: campaign.name, value: campaign.spend, formatted: formatCurrency(campaign.spend), shareBase: totalSpend }))
      },
      result: {
        title: `Detalhamento - ${resolvedSnapshot.resultLabel}`,
        accent: "#22c55e",
        label: resolvedSnapshot.resultLabel,
        values: resolvedDailySeries.map((item) => item.result),
        stats: [
          { label: "Total", value: formatNumber(totalResult) },
          { label: "Custo por resultado", value: totalResult > 0 ? formatCurrency(totalSpend / totalResult) : "R$ 0,00" }
        ],
        rows: [...campaigns]
          .sort((a, b) => b.result - a.result)
          .slice(0, 5)
          .map((campaign) => ({ name: campaign.name, value: campaign.result, formatted: formatNumber(campaign.result), shareBase: totalResult }))
      },
      revenue: {
        title: "Detalhamento - Faturamento",
        accent: "#eab308",
        label: "Faturamento (R$)",
        values: resolvedDailySeries.map((item) => item.revenue ?? 0),
        stats: [
          { label: "Total", value: formatCurrency(totalRevenue) },
          { label: "ROAS medio", value: formatRoas(resolvedSnapshot.roas) }
        ],
        rows: [...campaigns]
          .sort((a, b) => b.roas * b.spend - a.roas * a.spend)
          .slice(0, 5)
          .map((campaign) => {
            const revenue = campaign.roas * campaign.spend;
            return { name: campaign.name, value: revenue, formatted: formatCurrency(revenue), shareBase: totalRevenue };
          })
      },
      roas: {
        title: "Detalhamento - ROAS",
        accent: "#a855f7",
        label: "ROAS",
        values: resolvedDailySeries.map((item) => (item.spend > 0 ? (item.revenue ?? 0) / item.spend : 0)),
        stats: [
          { label: "ROAS medio", value: formatRoas(resolvedSnapshot.roas) },
          { label: "Receita", value: formatCurrency(totalRevenue) }
        ],
        rows: [...campaigns]
          .sort((a, b) => b.roas - a.roas)
          .slice(0, 5)
          .map((campaign) => ({ name: campaign.name, value: campaign.roas, formatted: formatRoas(campaign.roas), shareBase: Math.max(resolvedSnapshot.roas, 1) }))
      },
      cpa: {
        title: "Detalhamento - CPA",
        accent: "#f97316",
        label: "CPA (R$)",
        values: resolvedDailySeries.map((item) => (item.result > 0 ? item.spend / item.result : 0)),
        stats: [
          { label: "CPA real", value: formatCurrency(resolvedSnapshot.cpa) },
          { label: "Resultados", value: formatNumber(totalResult) }
        ],
        rows: [...campaigns]
          .filter((campaign) => campaign.result > 0)
          .sort((a, b) => a.spend / a.result - b.spend / b.result)
          .slice(0, 5)
          .map((campaign) => {
            const cpa = campaign.spend / campaign.result;
            return { name: campaign.name, value: cpa, formatted: formatCurrency(cpa), shareBase: Math.max(resolvedSnapshot.cpa, 1) };
          })
      }
    }[metricDrilldown];

    const width = 620;
    const height = 180;
    const padding = 18;
    const maxValue = Math.max(...config.values, 1);
    const points = config.values
      .map((value, index) => {
        const x = padding + (index / Math.max(config.values.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - (value / maxValue) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");

    return { ...config, points, width, height, padding };
  }, [dashboardData?.campaigns, metricDrilldown, resolvedDailySeries, resolvedSnapshot]);

  useEffect(() => {
    if (!availableClients.length) {
      return;
    }

    const stillExists = availableClients.some((client) => client.id === selectedClient.id);
    if (!stillExists) {
      const nextClient = availableClients[0];
      setSelectedClient(nextClient);
      setSearch(`${nextClient.name} (${nextClient.id})`);
    }
  }, [availableClients, selectedClient.id]);

  const visibleCampaigns = useMemo(() => {
    const filtered = (dashboardData?.campaigns ?? []).filter((campaign) => {
      if (!objectiveMatcher(campaign)) return false;
      if (campaignFilter === "all") return true;
      return campaign.status === campaignFilter;
    });

    return [...filtered].sort((a, b) => {
      const first = a[sortColumn];
      const second = b[sortColumn];
      if (typeof first === "string" && typeof second === "string") {
        return first.localeCompare(second) * sortDirection;
      }
      return ((Number(first) || 0) - (Number(second) || 0)) * sortDirection;
    });
  }, [campaignFilter, dashboardData?.campaigns, objectiveMatcher, sortColumn, sortDirection]);

  const metaViewSummary = useMemo(() => {
    const campaigns = (dashboardData?.campaigns ?? []).filter(objectiveMatcher);
    const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const reach = campaigns.reduce((sum, campaign) => sum + campaign.reach, 0);
    const clicks = campaigns.reduce((sum, campaign) => sum + (campaign.clicks ?? 0), 0);
    const results = campaigns.reduce((sum, campaign) => sum + (metaView === "sales" ? campaign.purchases ?? campaign.result : campaign.result), 0);
    const revenue = campaigns.reduce((sum, campaign) => sum + campaign.spend * campaign.roas, 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const costPerResult = results > 0 ? spend / results : 0;
    const ticket = results > 0 ? revenue / results : 0;
    const ctrWeighted = reach > 0 ? campaigns.reduce((sum, campaign) => sum + campaign.ctr * campaign.reach, 0) / reach : 0;
    const conversionRate = clicks > 0 ? (results / clicks) * 100 : 0;

    if (metaView === "messages") {
      return {
        primary: [
          { label: "Investimento Total", value: formatCurrency(spend), tone: "blue" as const },
          { label: "Conversas", value: formatNumber(results), tone: "green" as const },
          { label: "Alcance", value: formatNumber(reach), tone: "yellow" as const },
          { label: "CTR", value: formatPercent(ctrWeighted, 2), tone: "purple" as const }
        ],
        secondary: [
          { label: "Custo por conversa", value: formatCurrency(costPerResult), tone: "orange" as const },
          { label: "Cliques no link", value: formatNumber(clicks), tone: "cyan" as const },
          { label: "Taxa de conversao", value: formatPercent(conversionRate, 2), tone: "green" as const }
        ]
      };
    }

    if (metaView === "awareness") {
      return {
        primary: [
          { label: "Investimento Total", value: formatCurrency(spend), tone: "blue" as const },
          { label: "Resultados", value: formatNumber(results), tone: "green" as const },
          { label: "Alcance", value: formatNumber(reach), tone: "yellow" as const },
          { label: "CTR", value: formatPercent(ctrWeighted, 2), tone: "purple" as const }
        ],
        secondary: [
          { label: "Custo por resultado", value: formatCurrency(costPerResult), tone: "orange" as const },
          { label: "Cliques no link", value: formatNumber(clicks), tone: "cyan" as const },
          { label: "Taxa de conversao", value: formatPercent(conversionRate, 2), tone: "green" as const }
        ]
      };
    }

    return {
      primary: [
        { label: "Investimento Total", value: formatCurrency(spend || resolvedSnapshot.spend), tone: "blue" as const },
        { label: "Vendas", value: formatNumber(results || resolvedSnapshot.resultValue), tone: "green" as const },
        { label: "Faturamento Gerado", value: formatCurrency(revenue || resolvedSnapshot.revenue), tone: "yellow" as const },
        { label: "ROAS", value: formatRoas(roas || resolvedSnapshot.roas), tone: "purple" as const }
      ],
      secondary: [
        { label: "CPA real", value: formatCurrency(costPerResult || resolvedSnapshot.cpa), tone: "orange" as const },
        { label: "Ticket medio", value: formatCurrency(ticket || clientTicket), tone: "cyan" as const },
        { label: "Taxa de conversao", value: formatPercent(conversionRate || clientConversionRate, 2), tone: "green" as const }
      ]
    };
  }, [clientConversionRate, clientTicket, dashboardData?.campaigns, metaView, objectiveMatcher, resolvedSnapshot]);

  function handleSelectClient(client: Client) {
    setSelectedClient(client);
    setSearch(`${client.name} (${client.id})`);
  }

  function handleSort(column: keyof CampaignMetric) {
    if (sortColumn === column) {
      setSortDirection((value) => (value === 1 ? -1 : 1));
      return;
    }

    setSortColumn(column);
    setSortDirection(-1);
  }

  async function handleSendAi() {
    const value = aiText.trim();
    if (!value || aiLoading) return;

    setAiMessages((current) => [...current, `Voce: ${value}`]);
    setAiText("");
    setAiLoading(true);

    try {
      const response = await fetch("/api/ai/insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: value,
          context: {
            client: selectedClient,
            period,
            customRange: period === "custom" ? customRange : null,
            snapshot: resolvedSnapshot,
            quickInsights: resolvedSnapshot.quickInsights,
            alerts: resolvedSnapshot.alerts,
            funnel: resolvedSnapshot.funnel,
            campaigns: visibleCampaigns.slice(0, 12),
            dailySeries: resolvedDailySeries,
            mediaMetrics: resolvedMediaMetrics,
            objectiveDistribution: resolvedObjectiveDistribution,
            hourlyPerformance: resolvedHourlyPerformance,
            ageAudience: resolvedAgeAudience,
            genderAudience: resolvedGenderAudience
          }
        })
      });

      const payload = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Nao foi possivel consultar a IA agora.");
      }

      setAiMessages((current) => [...current, `IA: ${payload.answer || "Nao consegui gerar uma resposta com os dados atuais."}`]);
    } catch (error) {
      setAiMessages((current) => [
        ...current,
        `IA: ${error instanceof Error ? error.message : "Nao foi possivel consultar a IA agora."}`
      ]);
    } finally {
      setAiLoading(false);
    }
  }

  function exportReport() {
    const range = getPeriodRange(period, customRange);
    const startDate = new Date(`${range.start}T12:00:00`);
    const endDate = new Date(`${range.end}T12:00:00`);
    const exportCampaigns = (dashboardData?.campaigns ?? visibleCampaigns).filter(
      (campaign) => isSalesCampaign(campaign) && campaign.status === "ACTIVE" && campaign.spend > 0
    );
    const filteredSpend = exportCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
    const filteredReach = exportCampaigns.reduce((sum, campaign) => sum + campaign.reach, 0);
    const filteredSales = exportCampaigns.reduce((sum, campaign) => sum + (campaign.purchases ?? campaign.result), 0);
    const filteredRevenue = exportCampaigns.reduce((sum, campaign) => sum + campaign.spend * campaign.roas, 0);
    const averageTicket = filteredSales > 0 ? filteredRevenue / filteredSales : 0;
    const filteredCpa = filteredSales > 0 ? filteredSpend / filteredSales : 0;
    const filteredRoas = filteredSpend > 0 ? filteredRevenue / filteredSpend : 0;

    const reportSpend = exportCampaigns.length ? filteredSpend : resolvedSnapshot.spend;
    const reportReach = exportCampaigns.length ? filteredReach : (resolvedMediaMetrics.find((metric) => metric.label.toLowerCase().includes("alcance"))?.value ?? 0);
    const reportSales = exportCampaigns.length ? filteredSales : Math.max(resolvedSnapshot.resultValue, 0);
    const reportRevenue = exportCampaigns.length ? filteredRevenue : resolvedSnapshot.revenue;
    const reportAverageTicket = exportCampaigns.length ? averageTicket : reportSales > 0 ? resolvedSnapshot.revenue / reportSales : 0;
    const reportCpa = exportCampaigns.length ? filteredCpa : resolvedSnapshot.cpa;
    const reportRoas = exportCampaigns.length ? filteredRoas : resolvedSnapshot.roas;

    const report = [
      `Segue o relatório do período: ${selectedClient.name}`,
      "",
      `📆 (${formatDateLabel(startDate)} a ${formatDateLabel(endDate)})`,
      "",
      "CAMPANHA DE VENDA",
      "",
      `✅ Investimento total: *${formatCurrency(reportSpend)}*`,
      "",
      `👥 Alcançamos *${formatNumber(reportReach)}* pessoas`,
      `🔥 Número de venda: *${formatNumber(reportSales)}*`,
      `💵 Ticket médio: *${formatCurrency(reportAverageTicket)}*`,
      `🚀 Custo por venda: *${formatCurrency(reportCpa)}*`,
      `💸 Valor total das vendas: *${formatCurrency(reportRevenue)}*`,
      `📈 ROAS (Retorno sobre investimento): *${formatRoas(reportRoas)}*`
    ].join("\n");

    navigator.clipboard.writeText(report).catch(() => undefined);
    setToastVisible(true);
    window.setTimeout(() => setToastVisible(false), 2000);
  }

  const refreshMetaStatus = useCallback(async () => {
    const response = await fetch("/api/integrations/meta/status", {
      cache: "no-store"
    });

    const payload = (await response.json()) as MetaIntegrationStatus;
    setMetaStatus(payload);
    return payload;
  }, []);

  const loadDashboardData = useCallback(
    async (clientId: string, selectedPeriod: PeriodKey, selectedRange = customRange) => {
      setDashboardLoading(true);
      setDashboardError(null);

      try {
        const customQuery =
          selectedPeriod === "custom" ? `&since=${encodeURIComponent(selectedRange.start)}&until=${encodeURIComponent(selectedRange.end)}` : "";
        const response = await fetch(`/api/meta/dashboard?accountId=${encodeURIComponent(clientId)}&period=${encodeURIComponent(selectedPeriod)}${customQuery}`, {
          cache: "no-store"
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Nao foi possivel carregar os dados da Meta.");
        }

        setDashboardData(payload as DashboardDataBundle);
      } catch (error) {
        setDashboardData(null);
        setDashboardError(error instanceof Error ? error.message : "Nao foi possivel carregar os dados da Meta.");
      } finally {
        setDashboardLoading(false);
      }
    },
    [customRange]
  );

  const loadCampaignAds = useCallback(
    async (campaignId: string, selectedPeriod: PeriodKey, selectedRange = customRange) => {
      setCampaignAdsLoading(true);
      setCampaignAdsError(null);

      try {
        const customQuery =
          selectedPeriod === "custom" ? `&since=${encodeURIComponent(selectedRange.start)}&until=${encodeURIComponent(selectedRange.end)}` : "";
        const response = await fetch(`/api/meta/campaign-ads?campaignId=${encodeURIComponent(campaignId)}&period=${encodeURIComponent(selectedPeriod)}${customQuery}`, {
          cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Nao foi possivel carregar os anuncios da campanha.");
        }

        setCampaignAds((payload.ads as AdItem[]) || []);
      } catch (error) {
        setCampaignAds([]);
        setCampaignAdsError(error instanceof Error ? error.message : "Nao foi possivel carregar os anuncios da campanha.");
      } finally {
        setCampaignAdsLoading(false);
      }
    },
    [customRange]
  );

  useEffect(() => {
    refreshMetaStatus().catch(() => {
      setMetaStatus({
        stage: "disconnected",
        accounts: [],
        error: "Nao foi possivel consultar o status da integracao da Meta."
      });
    });
  }, [refreshMetaStatus]);

  useEffect(() => {
    if (activeTab !== "meta") {
      return;
    }

    const hasConnectedMeta = metaStatus?.stage === "connected" && metaStatus.accounts.length > 0;
    if (!hasConnectedMeta || !selectedClient?.id) {
      setDashboardData(null);
      setDashboardError(null);
      return;
    }

    void loadDashboardData(selectedClient.id, period, customRange);
  }, [activeTab, customRange, loadDashboardData, metaStatus?.accounts.length, metaStatus?.stage, period, selectedClient?.id]);

  useEffect(() => {
    if (!drawerCampaign) {
      setCampaignAds([]);
      setCampaignAdsError(null);
      setCampaignAdsLoading(false);
      return;
    }

    if (shouldUseMockMeta) {
      setCampaignAds(adsByCampaign[drawerCampaign.id] || []);
      setCampaignAdsError(null);
      setCampaignAdsLoading(false);
      return;
    }

    void loadCampaignAds(drawerCampaign.id, period, customRange);
  }, [customRange, drawerCampaign, loadCampaignAds, period, shouldUseMockMeta]);

  async function openMetaModal() {
    setMetaOpen(true);
    setMetaPending(true);
    setMetaFeedback(null);

    try {
      await refreshMetaStatus();
    } finally {
      setMetaPending(false);
    }
  }

  async function openConfigModal() {
    setConfigOpen(true);
    setMetaPending(true);

    try {
      await refreshMetaStatus();
    } finally {
      setMetaPending(false);
    }
  }

  async function confirmMetaSelection(accountIds: string[]) {
    setMetaPending(true);
    setMetaFeedback(null);

    try {
      const response = await fetch("/api/integrations/meta/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ accountIds })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Nao foi possivel finalizar a conexao.");
      }

      await refreshMetaStatus();
      setMetaFeedback("Conexao concluida com sucesso. As contas da Meta ja estao disponiveis no dashboard.");
      setMetaOpen(false);
      router.replace("/");
    } catch (error) {
      setMetaFeedback(error instanceof Error ? error.message : "Falha ao conectar as contas selecionadas.");
    } finally {
      setMetaPending(false);
    }
  }

  async function disconnectMeta() {
    setMetaPending(true);
    setMetaFeedback(null);

    try {
      await fetch("/api/integrations/meta/disconnect", {
        method: "POST"
      });

      await refreshMetaStatus();
      setMetaFeedback("A conexao com a Meta foi removida.");
    } finally {
      setMetaPending(false);
    }
  }

  function startMetaOAuth() {
    const returnTo = pathname || "/";
    window.location.href = `/api/integrations/meta/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  useEffect(() => {
    const metaStep = searchParams.get("meta");
    const reason = searchParams.get("reason");

    if (!metaStep) {
      return;
    }

    setMetaOpen(true);
    setMetaPending(true);

    refreshMetaStatus()
      .then(() => {
        if (metaStep === "select") {
          setMetaFeedback("Login da Meta concluido. Agora selecione quais contas deseja integrar.");
        } else if (metaStep === "error") {
          setMetaFeedback(reason ? decodeURIComponent(reason) : "A autenticacao com a Meta nao foi concluida.");
        }
      })
      .finally(() => {
        setMetaPending(false);
        router.replace(pathname || "/");
      });
  }, [pathname, router, searchParams, refreshMetaStatus]);

  return (
    <div className="min-h-screen">
      <HeaderBar
        filteredClients={filteredClients}
        search={search}
        selectedClient={selectedClient}
        period={period}
        customStartDate={customRange.start}
        customEndDate={customRange.end}
        onSearchChange={setSearch}
        onSelectClient={handleSelectClient}
        onPeriodChange={setPeriod}
        onCustomRangeChange={(startDate, endDate) => setCustomRange({ start: startDate, end: endDate })}
        onOpenTeam={() => setTeamOpen(true)}
        onOpenConfig={openConfigModal}
        onExport={exportReport}
      />
      <TabsNav activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === "meta" ? (
        <div className="border-t border-border/60 bg-card/20">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3 lg:px-6">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Tipo de campanha</div>
            <div className="flex gap-2 overflow-x-auto">
              {[
                { key: "sales", label: "Vendas" },
                { key: "awareness", label: "Reconhecimento" },
                { key: "messages", label: "Mensagens" }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMetaView(item.key as MetaView)}
                  className={clsx(
                    "shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition",
                    metaView === item.key ? "bg-blue text-white" : "border border-border bg-bg text-muted hover:border-blue hover:text-text"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        {requiresWorkspaceSetup ? (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-yellow/30 bg-yellow/10 px-4 py-4 text-sm text-yellow-100 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-semibold text-text">Finalize sua equipe para liberar convites e permissoes.</div>
              <div className="mt-1 text-yellow-100/80">
                O dashboard continua acessivel enquanto concluimos essa configuracao. Se a criacao falhar, a mensagem agora mostra a causa com mais clareza.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTeamOpen(true)}
                className="rounded-lg border border-yellow/40 px-4 py-2 font-semibold text-text transition hover:border-blue hover:text-text"
              >
                Configurar equipe
              </button>
            </div>
          </div>
        ) : null}
        {activeTab === "meta" ? (
          <div className="space-y-7">
            <MetaIntegrationCard status={metaStatus} loading={metaPending} onOpen={openMetaModal} />
            {dashboardError ? (
              <div className="rounded-2xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red-100">
                Nao conseguimos carregar os dados reais desta conta agora. {dashboardError}
              </div>
            ) : null}
            <QuickInsightsSection snapshot={resolvedSnapshot} />

            <section>
              <SectionTitle>Visao Geral</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {metaViewSummary.primary.map((card) => (
                  <MetricCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    tone={card.tone}
                    loading={dashboardLoading}
                    clickable={!dashboardLoading && metaView === "sales" && (card.label === "Investimento Total" || card.label === "Vendas" || card.label === "Faturamento Gerado" || card.label === "ROAS")}
                    onClick={
                      metaView !== "sales"
                        ? undefined
                        : card.label === "Investimento Total"
                          ? () => setMetricDrilldown("spend")
                          : card.label === "Vendas"
                            ? () => setMetricDrilldown("result")
                            : card.label === "Faturamento Gerado"
                              ? () => setMetricDrilldown("revenue")
                              : card.label === "ROAS"
                                ? () => setMetricDrilldown("roas")
                                : undefined
                    }
                  />
                ))}
              </div>
            </section>

            <section>
              <SectionTitle>Resultados de Conversao</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {metaViewSummary.secondary.map((card) => (
                  <MetricCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    tone={card.tone}
                    loading={dashboardLoading}
                    clickable={!dashboardLoading && metaView === "sales" && card.label === "CPA real"}
                    onClick={metaView === "sales" && card.label === "CPA real" ? () => setMetricDrilldown("cpa") : undefined}
                  />
                ))}
              </div>
            </section>

            {resolvedMediaMetrics.length ? <MediaMetricsSection metrics={resolvedMediaMetrics} loading={dashboardLoading} /> : null}

            <MetaVisualsSection
              dailySeries={resolvedDailySeries}
              objectiveDistribution={resolvedObjectiveDistribution}
              hourlyPerformance={resolvedHourlyPerformance}
              ageAudience={resolvedAgeAudience}
              genderAudience={resolvedGenderAudience}
              resultLabel={resolvedSnapshot.resultLabel}
            />

            <section className="panel p-5">
              <SectionTitle>Funil de Conversao</SectionTitle>
              <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_280px]">
                <div className="space-y-3">
                  {resolvedSnapshot.funnel.map((step, index) => {
                    const max = resolvedSnapshot.funnel[0]?.value || 1;
                    const width = Math.max(6, (step.value / max) * 100);
                    const colors: Record<string, string> = {
                      blue: "from-blue to-blue/70",
                      indigo: "from-blue/90 to-cyan/70",
                      purple: "from-purple to-blue/60",
                      orange: "from-orange to-orange/70",
                      yellow: "from-yellow to-orange/60",
                      green: "from-green to-emerald-300"
                    };

                    return (
                      <div key={step.label}>
                        <div className="mb-1 flex items-center justify-between text-sm text-muted">
                          <span>{step.label}</span>
                          <strong className="font-mono text-text">{formatNumber(step.value)}</strong>
                        </div>
                        <div className="h-8 rounded-lg bg-border/90">
                          <div
                            className={`flex h-full items-center rounded-lg bg-gradient-to-r px-3 text-xs font-semibold text-white ${colors[step.color]}`}
                            style={{ width: `${width}%` }}
                          >
                            {index === 0 ? "100%" : formatPercent((step.value / resolvedSnapshot.funnel[index - 1].value) * 100, 1)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-bg p-4">
                    <div className="mb-2 text-sm font-semibold">Gargalo principal</div>
                    <p className="text-xs leading-6 text-muted">{resolvedSnapshot.bottleneck}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg p-4">
                    <div className="mb-2 text-sm font-semibold">Ponto forte</div>
                    <p className="text-xs leading-6 text-muted">{resolvedSnapshot.strength}</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <SectionTitle>Campanhas</SectionTitle>
              <CampaignsTable
                campaigns={visibleCampaigns}
                filter={campaignFilter}
                onFilterChange={setCampaignFilter}
                onSort={handleSort}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onOpenCampaign={setDrawerCampaign}
              />
            </section>
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <SectionTitle>Pedidos & Faturamento</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Faturamento total" value={formatCurrency(cardapio.faturamento)} tone="green" />
                <MetricCard label="Numero de pedidos" value={formatNumber(cardapio.pedidos)} tone="blue" />
                <MetricCard label="Ticket medio" value={formatCurrency(cardapio.ticket)} tone="orange" />
                <MetricCard label="Taxa de conversao" value={formatPercent(cardapio.conversao, 2)} tone="purple" />
              </div>
            </section>

            <section className="panel p-5">
              <SectionTitle>Integracao futura</SectionTitle>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-bg p-4">
                  <div className="mb-2 text-sm font-semibold">Cardapios digitais</div>
                  <p className="text-sm leading-6 text-muted">
                    A estrutura ja esta pronta para conectar APIs de pedidos por cliente e cruzar faturamento com investimento em Meta Ads.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-bg p-4">
                  <div className="mb-2 text-sm font-semibold">Supabase + historico</div>
                  <p className="text-sm leading-6 text-muted">
                    A proxima camada ideal e salvar clientes, credenciais seguras, snapshots e alertas historicos no backend.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCardapioOpen(true)}
                  className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue/90"
                >
                  Conectar cardapio
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      <CampaignDrawer
        campaign={drawerCampaign}
        ads={campaignAds}
        loading={campaignAdsLoading}
        error={campaignAdsError}
        onClose={() => setDrawerCampaign(null)}
      />
      <div
        className={clsx(
          "fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4 transition-opacity duration-200",
          metricDrilldown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMetricDrilldown(null)}
      >
        <div
          className={clsx(
            "panel max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto p-5 transition duration-200 lg:p-6",
            metricDrilldown ? "scale-100 opacity-100" : "scale-95 opacity-0"
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="eyebrow mb-2">Detalhamento da metrica</div>
              <h2 className="text-2xl font-bold text-text">{drilldownContent?.title ?? "Detalhamento"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Leitura do periodo selecionado para {selectedClient.name}, com evolucao diaria e campanhas que mais puxaram o indicador.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMetricDrilldown(null)}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-muted transition hover:border-red hover:bg-red hover:text-white"
            >
              Fechar
            </button>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {(drilldownContent?.stats ?? []).map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-bg p-4">
                <div className="eyebrow mb-2">{stat.label}</div>
                <div className="font-mono text-xl font-bold text-text">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.9fr]">
            <div className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text">Evolucao diaria</div>
                  <div className="font-mono text-[11px] text-muted">{drilldownContent?.label}</div>
                </div>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: drilldownContent?.accent ?? "#3b82f6" }} />
              </div>
              {drilldownContent?.points ? (
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${drilldownContent.width} ${drilldownContent.height}`} className="h-48 min-w-[560px]">
                    {Array.from({ length: 4 }).map((_, index) => {
                      const y = drilldownContent.padding + (index / 3) * (drilldownContent.height - drilldownContent.padding * 2);
                      return <line key={y} x1={drilldownContent.padding} x2={drilldownContent.width - drilldownContent.padding} y1={y} y2={y} stroke="rgba(30,34,48,0.8)" />;
                    })}
                    <polyline points={drilldownContent.points} fill="none" stroke={drilldownContent.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    {drilldownContent.points.split(" ").map((point, index) => {
                      const [x, y] = point.split(",");
                      const label = resolvedDailySeries[index]?.label;
                      return (
                        <circle key={`${point}-${index}`} cx={x} cy={y} r="4" fill={drilldownContent.accent}>
                          <title>{label}</title>
                        </circle>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="rounded-xl border border-border p-4 text-sm text-muted">
                  Ainda nao ha serie diaria suficiente para esta metrica.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-4">
                <div className="text-sm font-semibold text-text">Top campanhas</div>
                <div className="font-mono text-[11px] text-muted">Participacao no indicador</div>
              </div>
              <div className="space-y-3">
                {(drilldownContent?.rows ?? []).length ? (
                  drilldownContent?.rows.map((row) => (
                    <div key={row.name} className="rounded-lg border border-border bg-card/70 p-3 transition hover:border-blue">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0 truncate text-sm font-semibold text-text">{row.name}</div>
                        <div className="font-mono text-xs text-blue">{row.formatted}</div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, row.shareBase > 0 ? (row.value / row.shareBase) * 100 : 0))}%`,
                            backgroundColor: drilldownContent?.accent ?? "#3b82f6"
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-border p-4 text-sm text-muted">
                    Sem campanhas suficientes para detalhar este indicador.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfigModal
        open={configOpen}
        metaStatus={metaStatus}
        metaPending={metaPending}
        onClose={() => setConfigOpen(false)}
        onOpenMeta={() => {
          setConfigOpen(false);
          void openMetaModal();
        }}
        onOpenCardapio={() => {
          setConfigOpen(false);
          setCardapioOpen(true);
        }}
      />
      <CardapioModal open={cardapioOpen} onClose={() => setCardapioOpen(false)} />
      <TeamSettingsModal open={teamOpen} onClose={() => setTeamOpen(false)} />
      <MetaIntegrationModal
        open={metaOpen}
        status={metaStatus}
        pending={metaPending}
        feedback={metaFeedback}
        onClose={() => setMetaOpen(false)}
        onStart={startMetaOAuth}
        onDisconnect={disconnectMeta}
        onConfirmSelection={confirmMetaSelection}
      />
      <AiPanel
        open={aiOpen}
        text={aiText}
        messages={aiMessages}
        loading={aiLoading}
        onClose={() => setAiOpen(false)}
        onOpen={() => setAiOpen((value) => !value)}
        onTextChange={setAiText}
        onSend={handleSendAi}
      />
      <div
        className={clsx(
          "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-blue/30 bg-card px-4 py-3 text-sm font-semibold text-text shadow-panel transition-all duration-200",
          toastVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
      >
        Relatório copiado!
      </div>
    </div>
  );
}
