"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CampaignMetric, Client, DashboardTab, MetaIntegrationStatus, PeriodKey } from "@/lib/types";
import { adsByCampaign, campaigns, cardapio, clients, dailySeries, snapshot } from "@/lib/mocks";
import { formatCurrency, formatNumber, formatPercent, formatRoas } from "@/lib/utils/format";
import { AiPanel } from "./ai-panel";
import { CampaignDrawer } from "./campaign-drawer";
import { CampaignsTable } from "./campaigns-table";
import { CardapioModal } from "./cardapio-modal";
import { ConfigModal } from "./config-modal";
import { HeaderBar } from "./header-bar";
import { MetaIntegrationCard } from "./meta-integration-card";
import { MetaIntegrationModal } from "./meta-integration-modal";
import { MetricCard } from "./metric-card";
import { QuickInsightsSection } from "./quick-insights-section";
import { SectionTitle } from "./section-title";
import { TabsNav } from "./tabs-nav";

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
  const [aiText, setAiText] = useState("");
  const [aiMessages, setAiMessages] = useState<string[]>([
    "Ola! Sou sua analista de Meta Ads da Laos Assessoria. Conecte sua conta e pergunte sobre metricas, criativos ou otimizacoes."
  ]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) => `${client.name} ${client.id}`.toLowerCase().includes(term));
  }, [search]);

  const visibleCampaigns = useMemo(() => {
    const filtered = campaigns.filter((campaign) => {
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
  }, [campaignFilter, sortColumn, sortDirection]);

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
      `Investimento: ${formatCurrency(snapshot.spend)}`,
      `${snapshot.resultLabel}: ${formatNumber(snapshot.resultValue)}`,
      `Faturamento: ${formatCurrency(snapshot.revenue)}`,
      `ROAS: ${formatRoas(snapshot.roas)}`
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

  useEffect(() => {
    refreshMetaStatus().catch(() => {
      setMetaStatus({
        stage: "disconnected",
        accounts: [],
        error: "Nao foi possivel consultar o status da integracao da Meta."
      });
    });
  }, [refreshMetaStatus]);

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
            <QuickInsightsSection snapshot={snapshot} />

            <section>
              <SectionTitle>Visao Geral</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Investimento Total" value={formatCurrency(snapshot.spend)} delta={`+${formatPercent(snapshot.spendDelta)}`} tone="blue" />
                <MetricCard label={snapshot.resultLabel} value={formatNumber(snapshot.resultValue)} delta={formatPercent(snapshot.resultDelta)} tone="green" />
                <MetricCard label="Faturamento Gerado" value={formatCurrency(snapshot.revenue)} delta={`+${formatPercent(snapshot.revenueDelta)}`} tone="yellow" />
                <MetricCard label="ROAS" value={formatRoas(snapshot.roas)} delta={formatPercent(snapshot.roasDelta)} tone="purple" />
              </div>
            </section>

            <section>
              <SectionTitle>Resultados de Conversao</SectionTitle>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <MetricCard label="CPA real" value={formatCurrency(snapshot.cpa)} delta={`+${formatPercent(snapshot.cpaDelta)}`} tone="orange" />
                <MetricCard label="Ticket medio" value={formatCurrency(cardapio.ticket)} delta="+16,0%" tone="cyan" />
                <MetricCard label="Taxa clique para pedido" value={formatPercent(cardapio.conversao, 2)} delta="-0,8%" tone="green" />
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <div className="panel p-5">
                <SectionTitle>Evolucao Temporal</SectionTitle>
                <div className="mt-5 grid h-72 grid-cols-7 items-end gap-3">
                  {dailySeries.map((day) => (
                    <div key={day.label} className="flex h-full flex-col items-center justify-end gap-2">
                      <div className="flex h-full w-full items-end gap-1">
                        <div className="w-1/2 rounded-t-md bg-blue" style={{ height: `${(day.spend / 520) * 100}%` }} />
                        <div className="w-1/2 rounded-t-md bg-orange/90" style={{ height: `${((day.revenue || 0) / 2020) * 100}%` }} />
                      </div>
                      <span className="font-mono text-[10px] text-muted">{day.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted">Azul = investimento. Laranja = faturamento do cardapio.</p>
              </div>

              <div className="panel p-5">
                <SectionTitle>Funil de Conversao</SectionTitle>
                <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_280px]">
                  <div className="space-y-3">
                    {snapshot.funnel.map((step, index) => {
                      const max = snapshot.funnel[0]?.value || 1;
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
                              {index === 0 ? "100%" : formatPercent((step.value / snapshot.funnel[index - 1].value) * 100, 1)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-bg p-4">
                      <div className="mb-2 text-sm font-semibold">Gargalo principal</div>
                      <p className="text-xs leading-6 text-muted">{snapshot.bottleneck}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-bg p-4">
                      <div className="mb-2 text-sm font-semibold">Ponto forte</div>
                      <p className="text-xs leading-6 text-muted">{snapshot.strength}</p>
                    </div>
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

      <CampaignDrawer campaign={drawerCampaign} ads={drawerCampaign ? adsByCampaign[drawerCampaign.id] || [] : []} onClose={() => setDrawerCampaign(null)} />
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
