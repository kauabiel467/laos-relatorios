"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export function DashboardApp() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>("meta");
  const [period, setPeriod] = useState<PeriodKey>("last_30d");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client>(clients[0]);
  const [campaignFilter, setCampaignFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [sortColumn, setSortColumn] = useState<keyof CampaignMetric>("spend");
  const [sortDirection, setSortDirection] = useState<1 | -1>(-1);
  const [configOpen, setConfigOpen] = useState(false);
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
  const [aiMessages, setAiMessages] = useState<string[]>([
    "Ola! Sou sua analista de Meta Ads da Laos Assessoria. Conecte sua conta e pergunte sobre metricas, criativos ou otimizacoes."
  ]);

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
  const resolvedDailySeries = dashboardData?.dailySeries ?? [];
  const resolvedMediaMetrics = dashboardData?.mediaMetrics ?? [];
  const resolvedObjectiveDistribution = dashboardData?.objectiveDistribution ?? [];
  const resolvedHourlyPerformance = dashboardData?.hourlyPerformance ?? [];

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
  }, [campaignFilter, dashboardData?.campaigns, sortColumn, sortDirection]);

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

  function handleSendAi() {
    const value = aiText.trim();
    if (!value) return;

    setAiMessages((current) => [
      ...current,
      `Voce: ${value}`,
      "IA: Estrutura pronta para integrar OpenAI ou outro motor de insights no proximo passo."
    ]);
    setAiText("");
  }

  function exportReport() {
    const report = [
      `Cliente: ${selectedClient.name}`,
      `Periodo: ${period}`,
      `Investimento: ${formatCurrency(resolvedSnapshot.spend)}`,
      `${resolvedSnapshot.resultLabel}: ${formatNumber(resolvedSnapshot.resultValue)}`,
      `Faturamento: ${formatCurrency(resolvedSnapshot.revenue)}`,
      `ROAS: ${formatRoas(resolvedSnapshot.roas)}`
    ].join("\n");

    navigator.clipboard.writeText(report).catch(() => undefined);
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
    async (clientId: string, selectedPeriod: PeriodKey) => {
      setDashboardLoading(true);
      setDashboardError(null);

      try {
        const response = await fetch(`/api/meta/dashboard?accountId=${encodeURIComponent(clientId)}&period=${encodeURIComponent(selectedPeriod)}`, {
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
    []
  );

  const loadCampaignAds = useCallback(
    async (campaignId: string, selectedPeriod: PeriodKey) => {
      setCampaignAdsLoading(true);
      setCampaignAdsError(null);

      try {
        const response = await fetch(`/api/meta/campaign-ads?campaignId=${encodeURIComponent(campaignId)}&period=${encodeURIComponent(selectedPeriod)}`, {
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
    []
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

    void loadDashboardData(selectedClient.id, period);
  }, [activeTab, loadDashboardData, metaStatus?.accounts.length, metaStatus?.stage, period, selectedClient?.id]);

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

    void loadCampaignAds(drawerCampaign.id, period);
  }, [drawerCampaign, loadCampaignAds, period, shouldUseMockMeta]);

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
        onSearchChange={setSearch}
        onSelectClient={handleSelectClient}
        onPeriodChange={setPeriod}
        onOpenConfig={openConfigModal}
        onExport={exportReport}
      />
      <TabsNav activeTab={activeTab} onChange={setActiveTab} />

      <main className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        {activeTab === "meta" ? (
          <div className="space-y-7">
            <MetaIntegrationCard status={metaStatus} loading={metaPending} onOpen={openMetaModal} />
            {dashboardError ? (
              <div className="rounded-2xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red-100">
                Nao conseguimos carregar os dados reais desta conta agora. {dashboardError}
              </div>
            ) : null}
            <QuickInsightsSection snapshot={resolvedSnapshot} />

            {resolvedMediaMetrics.length ? <MediaMetricsSection metrics={resolvedMediaMetrics} loading={dashboardLoading} /> : null}

            <section>
              <SectionTitle>Visao Geral</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Investimento Total"
                  value={dashboardLoading ? "Carregando..." : formatCurrency(resolvedSnapshot.spend)}
                  delta={formatPercent(resolvedSnapshot.spendDelta)}
                  tone="blue"
                />
                <MetricCard
                  label={resolvedSnapshot.resultLabel}
                  value={dashboardLoading ? "Carregando..." : formatNumber(resolvedSnapshot.resultValue)}
                  delta={formatPercent(resolvedSnapshot.resultDelta)}
                  tone="green"
                />
                <MetricCard
                  label="Faturamento Gerado"
                  value={dashboardLoading ? "Carregando..." : formatCurrency(resolvedSnapshot.revenue)}
                  delta={formatPercent(resolvedSnapshot.revenueDelta)}
                  tone="yellow"
                />
                <MetricCard
                  label="ROAS"
                  value={dashboardLoading ? "Carregando..." : formatRoas(resolvedSnapshot.roas)}
                  delta={formatPercent(resolvedSnapshot.roasDelta)}
                  tone="purple"
                />
              </div>
            </section>

            <section>
              <SectionTitle>Resultados de Conversao</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <MetricCard label="CPA real" value={dashboardLoading ? "Carregando..." : formatCurrency(resolvedSnapshot.cpa)} delta={formatPercent(resolvedSnapshot.cpaDelta)} tone="orange" />
                <MetricCard label="Ticket medio" value={formatCurrency(cardapio.ticket)} delta="+16,0%" tone="cyan" />
                <MetricCard label="Taxa clique para pedido" value={formatPercent(cardapio.conversao, 2)} delta="-0,8%" tone="green" />
              </div>
            </section>

            <MetaVisualsSection
              dailySeries={resolvedDailySeries}
              objectiveDistribution={resolvedObjectiveDistribution}
              hourlyPerformance={resolvedHourlyPerformance}
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
        onClose={() => setAiOpen(false)}
        onOpen={() => setAiOpen((value) => !value)}
        onTextChange={setAiText}
        onSend={handleSendAi}
      />
    </div>
  );
}
