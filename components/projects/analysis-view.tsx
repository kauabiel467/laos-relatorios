/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState, useRef } from "react";
import {
  METRICS,
  SECTIONS,
  customMetricValue,
  formatCustomMetric,
  formatMetric,
  metricChange,
  normalizeAnalysisConfig,
  periodDates,
  comparisonDates,
  type AnalysisConfig,
  type ProjectDocument,
  type InsightItem,
  type SectionKey,
  type MetricKey,
  type CustomMetricDefinition,
  type MetricSize,
  type MetricGoal,
  type MetricValues,
} from "@/lib/projects/model";
import { PRIMARY_KPI_IDS, isPrimaryKpiId, type MetricUnit, type PrimaryKpiId } from "@/lib/metrics/catalog";
import { inferCalculationFormat } from "@/lib/metrics/engine";
import { Dialog, FieldMessage, MetaMark, Toast, shortDate } from "./ui";
import { LineChart } from "./line-chart";
import { workspaceHref } from "@/lib/projects/routes";
import ProgressMetricCard, {
  type CardSize,
  type MetricAccent,
  type SeriesPoint,
} from "@/components/ui/progress-metric-card";

const defaultCustomMetric = (): CustomMetricDefinition => ({
  id: "",
  kind: "manual",
  label: "",
  description: "",
  format: "number",
  value: 0,
  left: "revenue",
  right: "spend",
  operation: "divide",
  unit: "count",
  origin: "manual",
  aggregation: "manual",
  formula: "Valor informado manualmente",
});

const metricUnitLabel = (unit: MetricUnit | undefined, currency: string) => {
  if (unit === "currency") return currency;
  if (unit === "percent") return "percentual";
  if (unit === "ratio") return "índice";
  return "contagem";
};

const safeRatio = (numerator: number | null, denominator: number | null, multiplier = 1) =>
  numerator != null && denominator != null && denominator !== 0
    ? numerator / denominator * multiplier
    : null;

function aggregateCampaignMetrics(
  campaigns: Array<{ metrics: MetricValues }>,
): MetricValues {
  const values = Object.fromEntries(
    (Object.keys(METRICS) as MetricKey[]).map((metric) => [metric, null]),
  ) as MetricValues;
  for (const metric of Object.keys(METRICS) as MetricKey[]) {
    if (METRICS[metric].aggregation !== "sum") continue;
    values[metric] = campaigns.reduce((sum, campaign) => sum + (campaign.metrics[metric] ?? 0), 0);
  }
  values.ctr = safeRatio(values.link_clicks, values.impressions, 100);
  values.cpc = safeRatio(values.spend, values.link_clicks);
  values.cpm = safeRatio(values.spend, values.impressions, 1000);
  values.roas = safeRatio(values.revenue, values.spend);
  values.cpa = safeRatio(values.spend, values.purchases);
  values.cost_message = safeRatio(values.spend, values.messages);
  values.cpl = safeRatio(values.spend, values.leads);
  // Alcance é único no nível da conta e não pode ser somado entre campanhas.
  values.reach = null;
  values.frequency = null;
  return values;
}

const defaultMetricGoal = (): MetricGoal => ({
  type: "target",
  value: 0,
  cadence: "monthly",
  autoRenew: true,
});

function SectionHeading({
  title,
  description,
  unit,
}: {
  title: string;
  description: string;
  unit?: string;
}) {
  return (
    <header className="pj-block-heading">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {unit ? <span className="pj-chart-unit">Unidade: {unit}</span> : null}
    </header>
  );
}

export function AnalysisView({
  document: doc,
  clientName,
  logo,
  staff,
  busy,
  onBack,
  onAction,
  initialPreview = false,
}: {
  document: ProjectDocument;
  clientName: string;
  logo?: string;
  staff: boolean;
  busy: boolean;
  initialPreview?: boolean;
  onBack: () => void;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
}) {
  const [auto, setAuto] = useState(false);
  const [config, setConfig] = useState(normalizeAnalysisConfig(doc.config)),
    [title, setTitle] = useState(doc.title),
    [preview, setPreview] = useState(!staff || initialPreview),
    [editor, setEditor] = useState(doc.kind === "template"),
    [dates, setDates] = useState(false),
    [share, setShare] = useState(false),
    [menu, setMenu] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(""),
    [link, setLink] = useState(""),
    [draggedMetric, setDraggedMetric] = useState(""),
    [customMetricOpen, setCustomMetricOpen] = useState(false),
    [editingCustomId, setEditingCustomId] = useState(""),
    [customMetric, setCustomMetric] = useState(defaultCustomMetric()),
    [customMetricError, setCustomMetricError] = useState(""),
    [selectedMetric, setSelectedMetric] = useState(""),
    [metricLibraryOpen, setMetricLibraryOpen] = useState(false),
    [metricLibraryTab, setMetricLibraryTab] = useState<"predefined" | "custom">("predefined"),
    [metricSearch, setMetricSearch] = useState(""),
    [replacingMetric, setReplacingMetric] = useState(""),
    [goalMetric, setGoalMetric] = useState(""),
    [goalDraft, setGoalDraft] = useState<MetricGoal>(defaultMetricGoal()),
    [filterMetric, setFilterMetric] = useState(""),
    [campaignSearch, setCampaignSearch] = useState(""),
    [campaignSelection, setCampaignSelection] = useState<string[]>([]),
    [inlineAnalysis, setInlineAnalysis] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setConfig(normalizeAnalysisConfig(doc.config));
    setTitle(doc.title);
  }, [doc]);
  useEffect(
    () =>
      setLink(
        window.location.origin + workspaceHref(
          doc.kind === "template" ? "templates" : doc.kind === "report" ? "reports" : "dashboards",
          { projectId: doc.client_id, documentId: doc.id, preview: "1" },
        ),
      ),
    [doc.id, doc.client_id, doc.kind],
  );
  useEffect(() => {
    if (!menu) return;
    const menuElement = menuRef.current;
    const items = Array.from(
      menuElement?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    items[0]?.focus();
    const closeMenu = () => {
      setMenu(false);
      menuButtonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuElement?.contains(target) && !menuButtonRef.current?.contains(target)) closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const current = Math.max(items.indexOf(document.activeElement as HTMLButtonElement), 0);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(current + direction + items.length) % items.length]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);
  const editable =
    staff && !(doc.kind === "report" && doc.status === "published");
  const data = doc.data,
    currency = data?.currency ?? "BRL";
  const dirty =
    JSON.stringify(config) !== JSON.stringify(normalizeAnalysisConfig(doc.config)) ||
    title !== doc.title;
  const patch = (value: Partial<AnalysisConfig>) =>
    setConfig((c) => ({ ...c, ...value }));
  const customMetrics = config.custom_metrics ?? [];
  const metricAliases = config.metric_aliases ?? {};
  const availableMetricIds = [
    ...config.metrics,
    ...customMetrics.map((metric) => metric.id),
    ...Object.keys(metricAliases),
  ];
  const metricOrder = [
    ...(config.metric_order ?? []).filter((id) =>
      availableMetricIds.includes(id),
    ),
    ...availableMetricIds.filter(
      (id) => !(config.metric_order ?? []).includes(id),
    ),
  ];
  const funnelMetrics: MetricKey[] = config.funnel_metrics?.length
    ? config.funnel_metrics
    : config.metrics.includes("purchases")
      ? ["link_clicks", "landing_views", "checkouts", "purchases"]
      : config.metrics.includes("messages")
        ? ["impressions", "link_clicks", "messages"]
        : ["impressions", "link_clicks", "leads"];
  const replaceMetric = (current: MetricKey, next: MetricKey) => {
    if (current === next || config.metrics.includes(next)) return;
    if (config.primary_metric === current && !isPrimaryKpiId(next)) return;
    const sizes = { ...(config.metric_sizes ?? {}) };
    if (sizes[current]) {
      sizes[next] = sizes[current];
      delete sizes[current];
    }
    const moveRecordKey = <T,>(record: Record<string, T> | undefined) => {
      if (!record?.[current]) return record ?? {};
      const moved = { ...record, [next]: record[current] };
      delete moved[current];
      return moved;
    };
    patch({
      metrics: config.metrics.map((metric) =>
        metric === current ? next : metric,
      ),
      metric_order: metricOrder.map((metric) =>
        metric === current ? next : metric,
      ),
      metric_sizes: sizes,
      featured_metrics: (config.featured_metrics ?? []).map((metric) => metric === current ? next : metric),
      metric_goals: moveRecordKey(config.metric_goals),
      metric_campaign_filters: moveRecordKey(config.metric_campaign_filters),
      chart_metric: config.chart_metric === current ? next : config.chart_metric,
      primary_metric: config.primary_metric === current
        ? next as PrimaryKpiId
        : config.primary_metric,
      funnel_metrics: config.funnel_metrics
        ? Array.from(
            new Set(
              config.funnel_metrics.map((metric) =>
                metric === current ? next : metric,
              ),
            ),
          )
        : undefined,
    });
  };
  const removeMetric = (id: string) => {
    const builtIn = id in METRICS;
    const alias = id in metricAliases;
    if (builtIn && config.metrics.length <= 1) return;
    const remaining = builtIn
      ? config.metrics.filter((metric) => metric !== id)
      : config.metrics;
    const fallbackPrimary = PRIMARY_KPI_IDS.find((metric) => remaining.includes(metric));
    if (id === config.primary_metric && !fallbackPrimary) return;
    patch({
      metrics: remaining,
      primary_metric: id === config.primary_metric ? fallbackPrimary! : config.primary_metric,
      chart_metric: id === config.primary_metric ? fallbackPrimary! : config.chart_metric,
      custom_metrics: builtIn
        ? customMetrics
        : customMetrics.filter((metric) => metric.id !== id),
      metric_aliases: Object.fromEntries(
        Object.entries(metricAliases).filter(([metric]) => metric !== id),
      ),
      metric_order: metricOrder.filter((metric) => metric !== id),
      metric_sizes: Object.fromEntries(
        Object.entries(config.metric_sizes ?? {}).filter(([metric]) => metric !== id),
      ),
      featured_metrics: (config.featured_metrics ?? []).filter((metric) => metric !== id),
      metric_goals: Object.fromEntries(
        Object.entries(config.metric_goals ?? {}).filter(([metric]) => metric !== id),
      ),
      metric_campaign_filters: Object.fromEntries(
        Object.entries(config.metric_campaign_filters ?? {}).filter(([metric]) => metric !== id),
      ),
    });
    if (alias || selectedMetric === id) setSelectedMetric("");
  };
  const duplicateMetric = (id: string, metric: MetricKey) => {
    const copyId = `copy_${metric}_${Date.now().toString(36)}`;
    const index = metricOrder.indexOf(id);
    const nextOrder = [...metricOrder];
    nextOrder.splice(index + 1, 0, copyId);
    patch({
      metric_aliases: { ...metricAliases, [copyId]: metric },
      metric_order: nextOrder,
      metric_sizes: {
        ...(config.metric_sizes ?? {}),
        [copyId]: config.metric_sizes?.[id] ?? "compact",
      },
    });
    setSelectedMetric(copyId);
  };
  const toggleFeatured = (id: string) => {
    const featured = config.featured_metrics ?? [];
    patch({
      featured_metrics: featured.includes(id)
        ? featured.filter((metric) => metric !== id)
        : [...featured, id],
    });
  };
  const openMetricGoal = (id: string) => {
    setGoalMetric(id);
    setGoalDraft(config.metric_goals?.[id] ?? defaultMetricGoal());
  };
  const openCampaignFilter = (id: string) => {
    setFilterMetric(id);
    setCampaignSearch("");
    setCampaignSelection(config.metric_campaign_filters?.[id] ?? []);
  };
  const reorderMetric = (target: string) => {
    if (!draggedMetric || draggedMetric === target) return;
    const next = metricOrder.filter((metric) => metric !== draggedMetric);
    next.splice(next.indexOf(target), 0, draggedMetric);
    patch({ metric_order: next });
    setDraggedMetric("");
  };
  const resizeMetric = (id: string) => {
    const current = config.metric_sizes?.[id] ?? "compact";
    const next: MetricSize =
      current === "compact" ? "wide" : current === "wide" ? "full" : "compact";
    patch({
      metric_sizes: { ...(config.metric_sizes ?? {}), [id]: next },
    });
  };
  const addBuiltInMetric = (metric: MetricKey) => {
    if (replacingMetric) {
      if (replacingMetric in metricAliases) {
        patch({ metric_aliases: { ...metricAliases, [replacingMetric]: metric } });
      } else if (replacingMetric in METRICS) {
        replaceMetric(replacingMetric as MetricKey, metric);
        setSelectedMetric(metric);
      }
      setReplacingMetric("");
      setMetricLibraryOpen(false);
      return;
    }
    if (config.metrics.includes(metric)) {
      setSelectedMetric(metric);
      setMetricLibraryOpen(false);
      return;
    }
    patch({
      metrics: [...config.metrics, metric],
      metric_order: [...metricOrder, metric],
    });
    setSelectedMetric(metric);
    setMetricLibraryOpen(false);
  };
  const addSection = (section: SectionKey) => {
    if (!config.sections.includes(section)) {
      patch({ sections: [...config.sections, section] });
    }
    if (section === "analysis") setInlineAnalysis(true);
    setMetricLibraryOpen(false);
  };
  const saveCustomMetric = () => {
    const id = editingCustomId || `custom_${Date.now().toString(36)}`;
    let next: CustomMetricDefinition;
    if (customMetric.kind === "calculated") {
      if (!customMetric.left || !customMetric.right || !customMetric.operation) {
        setCustomMetricError("Configure as duas métricas e a operação.");
        return;
      }
      const validation = inferCalculationFormat(
        customMetric.left,
        customMetric.right,
        customMetric.operation,
      );
      if (!validation.valid) {
        setCustomMetricError(validation.reason);
        return;
      }
      const unit: MetricUnit = validation.format === "money"
        ? "currency"
        : validation.format === "percent"
          ? "percent"
          : "ratio";
      next = {
        ...customMetric,
        id,
        format: validation.format,
        unit,
        origin: "calculated",
        aggregation: "derived",
        formula: `${METRICS[customMetric.left].id} ${customMetric.operation} ${METRICS[customMetric.right].id}`,
      };
    } else {
      const unit: MetricUnit = customMetric.format === "money"
        ? "currency"
        : customMetric.format === "percent"
          ? "percent"
          : customMetric.format === "ratio"
            ? "ratio"
            : "count";
      next = {
        ...customMetric,
        id,
        unit,
        origin: "manual",
        aggregation: "manual",
        formula: "Valor informado manualmente",
      };
    }
    patch({
      custom_metrics: editingCustomId
        ? customMetrics.map((metric) => (metric.id === id ? next : metric))
        : [...customMetrics, next],
      metric_order: editingCustomId ? metricOrder : [...metricOrder, id],
    });
    setEditingCustomId("");
    setCustomMetricError("");
    setCustomMetric(defaultCustomMetric());
    setCustomMetricOpen(false);
  };
  const action = async (a: string) => {
    setMenu(false);
    await onAction(
      a,
      a === "save" || a === "refresh"
        ? {
            config:
              a === "refresh" && config.preset !== "custom"
                ? { ...config, ...periodDates(config.preset) }
                : config,
            title,
          }
        : {},
    );
  };
  const refreshRef = useRef(() => {});
  refreshRef.current = () => {
    if (!busy && !dirty && documentVisibility()) void action("refresh");
  };
  useEffect(() => {
    if (!auto || !editable || doc.kind !== "dashboard") return;
    const timer = setInterval(() => refreshRef.current(), 300000);
    return () => clearInterval(timer);
  }, [auto, editable, doc.kind]);
  function documentVisibility() {
    return window.document.visibilityState === "visible";
  }
  const move = (index: number, direction: number) => {
    const sections = [...config.sections];
    const to = index + direction;
    if (to < 0 || to >= sections.length) return;
    [sections[index], sections[to]] = [sections[to], sections[index]];
    patch({ sections });
  };
  const compare =
    config.comparison === "previous" ? comparisonDates(config) : config;
  const effectiveSince = data?.effective_period?.since ?? config.since;
  const effectiveUntil = data?.effective_period?.until ?? config.until;
  const effectiveCompareSince = data?.effective_period?.compare_since ?? compare.compare_since;
  const effectiveCompareUntil = data?.effective_period?.compare_until ?? compare.compare_until;
  const row = (items: InsightItem[], name: string) => items.length ? (
    <div
      className="pj-table-scroll"
      role="region"
      aria-label={`Tabela de desempenho por ${name.toLowerCase()}`}
      aria-busy={busy}
      tabIndex={0}
    >
      {busy ? (
        <div className="pj-table-loading" role="status" aria-live="polite">
          Atualizando dados…
        </div>
      ) : null}
      <p className="pj-table-hint" aria-hidden="true">
        Deslize horizontalmente para ver todas as métricas →
      </p>
      <table>
        <caption className="pj-sr-only">
          Desempenho detalhado por {name.toLowerCase()}, com investimento e métricas configuradas.
        </caption>
        <thead>
          <tr>
            <th>{name}</th>
            <th>Investimento</th>
            {config.metrics
              .filter((k) => !["spend", "reach", "impressions"].includes(k))
              .slice(0, 4)
              .map((k) => (
                <th key={k}>{METRICS[k].label}</th>
              ))}
            <th>Impressões</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.thumbnail && (
                  <img
                    className="pj-thumb"
                    src={item.thumbnail}
                    alt={"Criativo de " + item.name}
                    referrerPolicy="no-referrer"
                  />
                )}
                <strong>{item.name}</strong>
                {name === "Anúncio" && !item.thumbnail && (
                  <small>Prévia indisponível</small>
                )}
              </td>
              <td>{formatMetric("spend", item.metrics.spend, currency)}</td>
              {config.metrics
                .filter((k) => !["spend", "reach", "impressions"].includes(k))
                .slice(0, 4)
                .map((k) => (
                  <td key={k}>{formatMetric(k, item.metrics[k], currency)}</td>
                ))}
              <td>
                {formatMetric(
                  "impressions",
                  item.metrics.impressions,
                  currency,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : busy ? (
    <div className="pj-table-skeleton" role="status" aria-live="polite" aria-label={`Carregando ${name.toLowerCase()}`}>
      <span />
      <span />
      <span />
      <span />
    </div>
  ) : (
    <div className="pj-no-data" role="status">
      <strong>Nenhum dado encontrado</strong>
      <span>Não há resultados de {name.toLowerCase()} para este período e filtro.</span>
    </div>
  );
  function renderSection(section: SectionKey) {
    if (!data) return null;
    switch (section) {
      case "metrics":
        return (
          <div className="pj-metric-grid">
            {metricOrder.map((id) => {
              const custom = customMetrics.find((metric) => metric.id === id);
              const builtIn = id in METRICS
                ? (id as MetricKey)
                : metricAliases[id] ?? null;
              if (!custom && !builtIn) return null;
              const definition = builtIn ? METRICS[builtIn] : custom!;
              const campaignIds = config.metric_campaign_filters?.[id] ?? [];
              const filteredValues = campaignIds.length
                ? aggregateCampaignMetrics(
                    data.campaigns.filter((campaign) => campaignIds.includes(campaign.id)),
                  )
                : null;
              const value = builtIn
                ? filteredValues?.[builtIn] ?? (campaignIds.length ? null : data.current[builtIn])
                : customMetricValue(custom!, filteredValues ?? data.current);
              const previous = campaignIds.length
                ? null
                : builtIn
                  ? data.previous?.[builtIn]
                : custom?.kind === "calculated"
                  ? customMetricValue(custom, data.previous)
                  : null;
              const delta = metricChange(value, previous);
              const size = config.metric_sizes?.[id] ?? "compact";
              const formatted = builtIn
                ? formatMetric(builtIn, value, currency)
                : formatCustomMetric(custom!, value, currency);
              const formattedPrevious = builtIn
                ? formatMetric(builtIn, previous, currency)
                : formatCustomMetric(custom!, previous, currency);
              const seriesData: SeriesPoint[] = campaignIds.length ? [] : data.daily.flatMap((day) => {
                const pointValue = builtIn
                  ? day.metrics[builtIn]
                  : custom?.kind === "calculated"
                    ? customMetricValue(custom, day.metrics)
                    : null;
                return typeof pointValue === "number" && Number.isFinite(pointValue)
                  ? [{ date: day.date, value: pointValue }]
                  : [];
              });
              const favorableDirection = builtIn
                ? METRICS[builtIn].favorableDirection
                : custom?.lower
                  ? "decrease"
                  : "increase";
              const favorable = delta == null || delta === 0 || favorableDirection === "neutral"
                ? null
                : favorableDirection === "decrease"
                  ? delta < 0
                  : delta > 0;
              const accent: MetricAccent = delta == null || delta === 0
                ? "neutral"
                : favorableDirection === "neutral"
                  ? "blue"
                : favorable
                  ? "emerald"
                  : "rose";
              const cardSize: CardSize = size === "full" ? "lg" : size === "wide" ? "md" : "sm";
              const effectiveSince = data.effective_period?.since ?? config.since;
              const effectiveUntil = data.effective_period?.until ?? config.until;
              const periodLabel = effectiveSince && effectiveUntil
                ? `${shortDate(effectiveSince)} – ${shortDate(effectiveUntil)}`
                : "Período atual";
              const comparisonLabel = !data.previous
                ? "Comparação desativada"
                : campaignIds.length
                  ? `${campaignIds.length} campanha${campaignIds.length === 1 ? "" : "s"} neste indicador`
                : previous === 0 && value != null
                  ? "O período anterior terminou em zero"
                  : previous != null
                    ? `${formattedPrevious} no período anterior`
                    : "Sem dado no período anterior";
              const statusLabel = delta == null
                ? campaignIds.length
                  ? "Filtro por campanha"
                  : data.previous
                  ? "Sem base comparável"
                  : "Sem comparação"
                : delta === 0
                  ? "Sem variação"
                  : favorable == null
                    ? "Variação"
                    : favorable
                      ? "Melhora"
                      : "Piora";
              return (
                <div
                  className={`pj-progress-metric-item size-${size} ${id === config.primary_metric ? "is-primary" : ""} ${selectedMetric === id ? "is-selected" : ""}`}
                  key={id}
                  onClick={(event) => {
                    if (!editor || preview) return;
                    if ((event.target as HTMLElement).closest("button, select, input, a")) return;
                    setSelectedMetric(id);
                  }}
                  onDragOver={(event) => {
                    if (editor && !preview) event.preventDefault();
                  }}
                  onDrop={() => reorderMetric(id)}
                >
                  <ProgressMetricCard
                    title={definition.label}
                    description={definition.description || "Métrica personalizada"}
                    total={formatted}
                    percent={delta == null ? undefined : `${Math.abs(delta).toFixed(1).replace(".", ",")}%`}
                    trend={delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down"}
                    statusLabel={statusLabel}
                    comparisonLabel={comparisonLabel}
                    period={periodLabel}
                    unitLabel={metricUnitLabel(definition.unit, currency)}
                    accent={accent}
                    data={seriesData}
                    size={cardSize}
                    featured={id === config.primary_metric}
                    highlighted={(config.featured_metrics ?? []).includes(id)}
                    goal={config.metric_goals?.[id] && value != null ? (() => {
                      const goal = config.metric_goals![id];
                      const progress = goal.value > 0 ? value / goal.value * 100 : 0;
                      const reached = goal.type === "target" ? value >= goal.value : value <= goal.value;
                      return {
                        label: goal.type === "target" ? "Meta" : "Limite",
                        valueLabel: builtIn
                          ? formatMetric(builtIn, goal.value, currency)
                          : formatCustomMetric(custom!, goal.value, currency),
                        progress,
                        status: reached
                          ? goal.type === "target" ? "Meta atingida" : "Dentro do limite"
                          : `${Math.min(Math.round(progress), 999)}% alcançado`,
                      };
                    })() : undefined}
                    defaultIndex={Math.max(seriesData.length - 1, 0)}
                    dateFormatter={shortDate}
                    valueFormatter={(pointValue) =>
                      builtIn
                        ? formatMetric(builtIn, pointValue, currency)
                        : formatCustomMetric(custom!, pointValue, currency)
                    }
                    controls={editor && !preview && selectedMetric === id ? (
                      <div className="pj-metric-controls" role="toolbar" aria-label={`Editar ${definition.label}`}>
                        <button
                          className="pj-drag-handle"
                          draggable
                          aria-label={`Arrastar ${definition.label}`}
                          title="Segure e arraste para reordenar"
                          onDragStart={() => setDraggedMetric(id)}
                          onDragEnd={() => setDraggedMetric("")}
                        >
                          ⠿
                        </button>
                        <button
                          className={(config.featured_metrics ?? []).includes(id) ? "is-active" : ""}
                          aria-label={`${(config.featured_metrics ?? []).includes(id) ? "Remover destaque de" : "Destacar"} ${definition.label}`}
                          title="Destacar"
                          onClick={() => toggleFeatured(id)}
                        >
                          {(config.featured_metrics ?? []).includes(id) ? "★" : "☆"}
                        </button>
                        {builtIn ? (
                          <button aria-label={`Duplicar ${definition.label}`} title="Duplicar" onClick={() => duplicateMetric(id, builtIn)}>⧉</button>
                        ) : null}
                        {builtIn ? (
                          <button
                            aria-label={`Trocar ${definition.label}`}
                            title="Trocar métrica"
                            onClick={() => {
                              setReplacingMetric(id);
                              setMetricLibraryTab("predefined");
                              setMetricSearch("");
                              setMetricLibraryOpen(true);
                            }}
                          >
                            ⚙
                          </button>
                        ) : null}
                        <button aria-label={`Definir meta para ${definition.label}`} title="Meta ou limite" onClick={() => openMetricGoal(id)}>◎</button>
                        {builtIn ? (
                          <button
                            className={campaignIds.length ? "is-active" : ""}
                            aria-label={`Filtrar ${definition.label} por campanha`}
                            title="Filtrar por campanha"
                            onClick={() => openCampaignFilter(id)}
                          >
                            ⌕
                          </button>
                        ) : null}
                        <button
                          aria-label={`Alterar tamanho de ${definition.label}`}
                          title="Alternar entre compacto, largo e largura total"
                          onClick={() => resizeMetric(id)}
                        >
                          {size === "compact" ? "1×" : size === "wide" ? "2×" : "4×"}
                        </button>
                        <button
                          className="danger"
                          aria-label={`Remover ${definition.label}`}
                          disabled={builtIn != null && config.metrics.length <= 1}
                          onClick={() => removeMetric(id)}
                        >
                          ×
                        </button>
                      </div>
                    ) : undefined}
                  />
                </div>
              );
            })}
          </div>
        );
      case "daily": {
        return (
          <section className="pj-block">
            <SectionHeading
              title="Investimento ao longo do período"
              description="Evolução diária do valor registrado pela Meta para os filtros selecionados."
              unit={currency}
            />
            {data.daily.length ? (
              <>
                <div className="pj-chart-legend" aria-label={`Legenda: investimento em ${currency}`}>
                  <span><i className="investment" aria-hidden="true" /> Investimento</span>
                </div>
                <LineChart
                  daily={data.daily}
                  metric="spend"
                  currency={currency}
                  color="var(--pj-primary)"
                  label="Investimento"
                  unitLabel={currency}
                />
                <details>
                  <summary>Ver valores por dia</summary>
                  {row(
                    data.daily.map((d) => ({
                      id: d.date,
                      name: shortDate(d.date),
                      metrics: d.metrics,
                    })),
                    "Dia",
                  )}
                </details>
              </>
            ) : (
              <div className="pj-no-data" role="status">
                <strong>Sem evolução diária</strong>
                <span>Não há investimento diário para o período e os filtros selecionados.</span>
              </div>
            )}
          </section>
        );
      }
      case "results": {
        const metric = config.primary_metric;
        return (
          <section className="pj-block">
            <SectionHeading
              title={`${METRICS[metric].label} ao longo do período`}
              description={`Evolução diária do KPI principal: ${METRICS[metric].description}`}
              unit={metricUnitLabel(METRICS[metric].unit, currency)}
            />
            {data.daily.length ? (
              <>
                <div className="pj-chart-legend" aria-label={`Legenda: ${METRICS[metric].label}`}>
                  <span><i aria-hidden="true" /> {METRICS[metric].label}</span>
                </div>
                <LineChart
                  daily={data.daily}
                  metric={metric}
                  currency={currency}
                  color="var(--pj-primary)"
                  label={METRICS[metric].label}
                  unitLabel={metricUnitLabel(METRICS[metric].unit, currency)}
                />
                <details>
                  <summary>Ver valores do KPI por dia</summary>
                  {row(
                    data.daily.map((day) => ({
                      id: day.date,
                      name: shortDate(day.date),
                      metrics: day.metrics,
                    })),
                    "Dia",
                  )}
                </details>
              </>
            ) : (
              <div className="pj-no-data" role="status">
                <strong>Sem evolução diária</strong>
                <span>Não há dados diários do KPI principal para este período.</span>
              </div>
            )}
          </section>
        );
      }
      case "funnel": {
        return (
          <section className="pj-block">
            <SectionHeading
              title="Etapas de resultado"
              description="Leitura das etapas reportadas pela Meta, sem inferir uma jornada individual entre elas."
            />
            <div className="pj-funnel">
              {funnelMetrics.map((k, i) => (
                <div
                  key={k}
                  style={{
                    width: 100 - i * 13 + "%",
                    background: ["#e4edff", "#b2cbf6", "#719de2", "#2457aa"][i],
                    color: i > 1 ? "white" : "#1a3967",
                  }}
                >
                  <span>{METRICS[k].label}</span>
                  <strong>{formatMetric(k, data.current[k], currency)}</strong>
                </div>
              ))}
            </div>
            <p className="pj-footnote">
              Eventos reportados pela Meta. As etapas não comprovam que as
              mesmas pessoas percorreram todo o caminho.
            </p>
          </section>
        );
      }
      case "campaigns":
        return (
          <section className="pj-block">
            <SectionHeading title="Campanhas em destaque" description="Onde investimento e resultados tiveram maior impacto no período." />
            {row(data.campaigns, "Campanha")}
          </section>
        );
      case "adsets":
        return (
          <section className="pj-block">
            <SectionHeading title="Conjuntos de anúncios" description="Detalhamento dos conjuntos que compõem o resultado da conta." />
            {row(data.adsets, "Conjunto")}
          </section>
        );
      case "ads":
        return (
          <section className="pj-block">
            <SectionHeading title="Criativos e anúncios" description="Desempenho dos anúncios e prévias disponibilizadas pela Meta." />
            {row(data.ads, "Anúncio")}
            <p className="pj-footnote">
              Prévias disponíveis para até 12 anúncios com maior investimento. A
              disponibilidade depende da Meta.
            </p>
          </section>
        );
      case "platforms":
        return (
          <section className="pj-block">
            <SectionHeading title="Desempenho por plataforma" description="Comparação dos resultados reportados em cada posicionamento de plataforma." />
            {row(data.platforms, "Plataforma")}
          </section>
        );
      case "audience":
        return (
          <section className="pj-block">
            <SectionHeading title="Público por idade e gênero" description="Distribuição dos resultados nos segmentos disponibilizados pela Meta." />
            {row(data.audience, "Público")}
          </section>
        );
      case "analysis":
        return (
          <section className={`pj-block pj-inline-analysis ${inlineAnalysis && editor && !preview ? "is-editing" : ""}`}>
            <SectionHeading title="Análise e próximos passos" description="Contexto, pontos de atenção e recomendações registrados pelo gestor." />
            {inlineAnalysis && editor && !preview ? (
              <div className="pj-inline-analysis-editor">
                <textarea
                  data-autofocus
                  rows={8}
                  value={config.analysis}
                  placeholder="Escreva a leitura dos resultados, os aprendizados e os próximos passos…"
                  onChange={(event) => patch({ analysis: event.target.value })}
                />
                <div>
                  <button type="button" onClick={() => setInlineAnalysis(false)}>Concluir edição</button>
                  <small>{config.analysis.length.toLocaleString("pt-BR")} de 20.000 caracteres</small>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="pj-prose pj-prose-button"
                disabled={!editor || preview}
                onClick={() => setInlineAnalysis(true)}
              >
                {config.analysis || "Clique para adicionar a análise do gestor."}
              </button>
            )}
          </section>
        );
    }
  }
  return (
    <div
      className={
        "pj-analysis " +
        (preview ? "client-preview" : "") +
        (doc.kind === "report" ? " is-report" : "")
      }
    >
      <div className="pj-analysis-toolbar">
        <button onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>{preview ? clientName : "Voltar ao projeto"}</span>
        </button>
        <strong>{title}</strong>
        <span className="pj-badge">
          {doc.status === "published" ? "Publicado" : "Rascunho"}
        </span>
        <div className="pj-toolbar-right">
          {staff && preview && (
            <button onClick={() => setPreview(!preview)}>
              Voltar à edição
            </button>
          )}
          {staff && !preview && (
            <a
              className="pj-button"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver como cliente ↗
            </a>
          )}
          <button onClick={() => setShare(true)}>Compartilhar ↗</button>
          {staff && !preview && (
            <div className="pj-more-actions">
              <button
                ref={menuButtonRef}
                aria-label="Mais ações do documento"
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-controls="document-actions-menu"
                onClick={() => setMenu(!menu)}
              >
                <span aria-hidden="true">•••</span>
              </button>
              {menu && (
                <div ref={menuRef} className="pj-menu" id="document-actions-menu" role="menu">
                  {editable && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setEditor(true);
                        setMenu(false);
                        menuButtonRef.current?.focus();
                      }}
                    >
                      Configurações e blocos
                    </button>
                  )}
                  <button role="menuitem" disabled={busy} onClick={() => {
                    setMenu(false);
                    menuButtonRef.current?.focus();
                    void action("template");
                  }}>
                    Salvar como template
                  </button>
                  <button role="menuitem" disabled={busy} onClick={() => {
                    setMenu(false);
                    menuButtonRef.current?.focus();
                    void action("duplicate");
                  }}>
                    Duplicar {doc.kind === "dashboard" ? "dashboard" : "relatório"}
                  </button>
                  {doc.kind === "dashboard" && (
                    <button role="menuitem" disabled={busy} onClick={() => {
                      setMenu(false);
                      menuButtonRef.current?.focus();
                      void action("convert");
                    }}>
                      Converter em relatório
                    </button>
                  )}
                  <button role="menuitem" disabled={busy} onClick={() => {
                    setMenu(false);
                    menuButtonRef.current?.focus();
                    void action("timeline");
                  }}>
                    Adicionar à linha do tempo
                  </button>
                  {doc.kind === "dashboard" && doc.status === "published" && (
                    <button role="menuitem" disabled={busy} onClick={() => {
                      setMenu(false);
                      menuButtonRef.current?.focus();
                      void action("unpublish");
                    }}>
                      Restringir ao gestor
                    </button>
                  )}
                  {doc.status === "draft" && (
                    <>
                      <div className="pj-menu-separator" role="separator" />
                      <button
                        role="menuitem"
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          setMenu(false);
                          setConfirmDelete(true);
                        }}
                      >
                        Excluir rascunho
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="pj-analysis-subbar">
        <div className="pj-analysis-period">
          <button
            className="pj-period-control"
            disabled={!editable || preview}
            onClick={() => setDates(true)}
          >
            <span aria-hidden="true">□</span>
            Alterar período
          </button>
          <dl className="pj-period-summary" aria-label="Período da análise">
            <div>
              <dt>Período</dt>
              <dd>{shortDate(effectiveSince)} — {shortDate(effectiveUntil)}</dd>
            </div>
            <div>
              <dt>Comparação</dt>
              <dd>
                {config.comparison !== "none" && effectiveCompareSince && effectiveCompareUntil
                  ? `${shortDate(effectiveCompareSince)} — ${shortDate(effectiveCompareUntil)}`
                  : "Desativada"}
              </dd>
            </div>
          </dl>
        </div>
        {staff && !preview && editable && (
          <div className="pj-analysis-actions">
            <div className="pj-analysis-data-controls">
              <button disabled={busy} onClick={() => void action("refresh")}>
                <span aria-hidden="true">↻</span>
                {busy ? "Atualizando…" : "Atualizar dados"}
              </button>
              {doc.kind === "dashboard" && (
                <label className="pj-check pj-auto-refresh">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                  />
                  <span>
                    Autoatualizar
                    <small>A cada 5 min</small>
                  </span>
                </label>
              )}
            </div>
            <div className="pj-analysis-edit-controls">
              <button onClick={() => setEditor(!editor)}>
                <span aria-hidden="true">✎</span>
                {editor ? "Fechar edição" : "Editar blocos"}
              </button>
              {dirty && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void action("save")}
                >
                  Salvar alterações
                </button>
              )}
              {doc.status === "draft" && (
                <button
                  className={!dirty ? "primary" : ""}
                  disabled={busy || !data || dirty}
                  onClick={() => void action("publish")}
                >
                  Publicar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {dirty && (
        <div className="pj-notice">
          Há alterações não salvas. Salve os blocos ou use “Atualizar dados”
          para aplicar datas e filtros.
        </div>
      )}
      <div
        className={
          "pj-analysis-layout " + (editor && !preview ? "editing" : "")
        }
      >
        {metricLibraryOpen && editor && !preview ? (
          <aside className="pj-metric-library" aria-label="Catálogo de métricas e blocos">
            <header>
              <div>
                <small>Meta Ads</small>
                <h3>{replacingMetric ? "Trocar métrica" : "Adicionar ao relatório"}</h3>
              </div>
              <button
                type="button"
                aria-label="Fechar catálogo"
                onClick={() => {
                  setMetricLibraryOpen(false);
                  setReplacingMetric("");
                }}
              >
                ×
              </button>
            </header>
            <div className="pj-library-tabs" role="tablist" aria-label="Tipo de conteúdo">
              <button
                type="button"
                role="tab"
                aria-selected={metricLibraryTab === "predefined"}
                className={metricLibraryTab === "predefined" ? "is-active" : ""}
                onClick={() => setMetricLibraryTab("predefined")}
              >
                Métricas prontas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={metricLibraryTab === "custom"}
                className={metricLibraryTab === "custom" ? "is-active" : ""}
                onClick={() => setMetricLibraryTab("custom")}
              >
                Personalizados
              </button>
            </div>
            {metricLibraryTab === "predefined" ? (
              <>
                <label className="pj-library-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    data-autofocus
                    value={metricSearch}
                    placeholder="Buscar métrica…"
                    onChange={(event) => setMetricSearch(event.target.value)}
                  />
                </label>
                <div className="pj-library-list">
                  {(Object.keys(METRICS) as MetricKey[])
                    .filter((metric) => {
                      const term = metricSearch.trim().toLocaleLowerCase("pt-BR");
                      return !term || `${METRICS[metric].label} ${METRICS[metric].description}`.toLocaleLowerCase("pt-BR").includes(term);
                    })
                    .map((metric) => {
                      const alreadyAdded = config.metrics.includes(metric);
                      const replacingBuiltIn = replacingMetric in METRICS;
                      return (
                        <button
                          type="button"
                          key={metric}
                          disabled={alreadyAdded && replacingBuiltIn && replacingMetric !== metric}
                          onClick={() => addBuiltInMetric(metric)}
                        >
                          <span>
                            <strong>{METRICS[metric].label}</strong>
                            <small>{METRICS[metric].description}</small>
                          </span>
                          <b>{alreadyAdded && !replacingMetric ? "No relatório" : replacingMetric ? "Trocar" : "Adicionar"}</b>
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="pj-custom-blocks">
                <p>Crie blocos para explicar os resultados ou montar indicadores próprios.</p>
                <button type="button" onClick={() => addSection("analysis")}><span>▤</span><b>Análise</b><small>Texto com aprendizados e próximos passos</small></button>
                <button type="button" onClick={() => addSection("funnel")}><span>▽</span><b>Funil</b><small>Conversão entre as etapas escolhidas</small></button>
                <button type="button" onClick={() => addSection("results")}><span>↗</span><b>Gráfico</b><small>Evolução do indicador principal</small></button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricLibraryOpen(false);
                    setEditingCustomId("");
                    setCustomMetricError("");
                    setCustomMetric({ ...defaultCustomMetric(), kind: "calculated", format: "ratio" });
                    setCustomMetricOpen(true);
                  }}
                ><span>⌗</span><b>Métrica calculada</b><small>Combine duas métricas do catálogo</small></button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricLibraryOpen(false);
                    setEditingCustomId("");
                    setCustomMetricError("");
                    setCustomMetric(defaultCustomMetric());
                    setCustomMetricOpen(true);
                  }}
                ><span>✎</span><b>Métrica manual</b><small>Informe um valor próprio</small></button>
              </div>
            )}
          </aside>
        ) : null}
        {editor && !preview && (
          <aside className="pj-editor">
            <h3>Personalizar apresentação</h3>
            <label>
              Título
              <input
                value={title}
                maxLength={180}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Subtítulo
              <input
                value={config.subtitle}
                onChange={(e) => patch({ subtitle: e.target.value })}
              />
            </label>
            <h4>Indicadores</h4>
            <label>
              KPI principal
              <select
                value={config.primary_metric}
                onChange={(event) => {
                  const primary = event.target.value as PrimaryKpiId;
                  patch({ primary_metric: primary, chart_metric: primary });
                }}
              >
                {PRIMARY_KPI_IDS.filter((id) => config.metrics.includes(id)).map((id) => (
                  <option key={id} value={id}>{METRICS[id].label}</option>
                ))}
              </select>
            </label>
            {(Object.keys(METRICS) as MetricKey[]).map((k) => (
              <label key={k} className="pj-check">
                <input
                  type="checkbox"
                  checked={config.metrics.includes(k)}
                  onChange={(e) => {
                    if (e.target.checked)
                      patch({
                        metrics: [...config.metrics, k],
                        metric_order: [...metricOrder, k],
                      });
                    else removeMetric(k);
                  }}
                />
                {METRICS[k].label}
              </label>
            ))}
            <button
              onClick={() => {
                setEditingCustomId("");
                setCustomMetricError("");
                setCustomMetric(defaultCustomMetric());
                setCustomMetricOpen(true);
              }}
            >
              ＋ Métrica manual ou calculada
            </button>
            {!!customMetrics.length && (
              <div className="pj-custom-metric-list">
                {customMetrics.map((metric) => (
                  <div key={metric.id}>
                    <span>
                      {metric.label}
                      <small>
                        {metric.kind === "manual" ? "Manual" : "Calculada"}
                      </small>
                    </span>
                    <button
                      aria-label={`Editar ${metric.label}`}
                      onClick={() => {
                        setEditingCustomId(metric.id);
                        setCustomMetricError("");
                        setCustomMetric(metric);
                        setCustomMetricOpen(true);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="danger"
                      aria-label={`Remover ${metric.label}`}
                      onClick={() => removeMetric(metric.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <h4>Blocos e ordem</h4>
            {config.sections.map((k, i) => (
              <div className="pj-block-order" key={k}>
                <span>{SECTIONS[k]}</span>
                <button
                  aria-label={"Mover " + SECTIONS[k] + " acima"}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={"Mover " + SECTIONS[k] + " abaixo"}
                  disabled={i === config.sections.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  className="danger"
                  aria-label={"Remover " + SECTIONS[k]}
                  onClick={() =>
                    patch({ sections: config.sections.filter((x) => x !== k) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <select
              aria-label="Adicionar bloco"
              value=""
              onChange={(e) =>
                patch({
                  sections: [...config.sections, e.target.value as SectionKey],
                })
              }
            >
              <option value="">+ Adicionar bloco</option>
              {(Object.keys(SECTIONS) as SectionKey[])
                .filter((k) => !config.sections.includes(k))
                .map((k) => (
                  <option key={k} value={k}>
                    {SECTIONS[k]}
                  </option>
                ))}
            </select>
            {config.sections.includes("results") && (
              <label>
                Métrica do gráfico
                <select
                  value={config.chart_metric ?? config.metrics[0]}
                  onChange={(event) =>
                    patch({ chart_metric: event.target.value as MetricKey })
                  }
                >
                  {config.metrics.map((metric) => (
                    <option key={metric} value={metric}>
                      {METRICS[metric].label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {config.sections.includes("funnel") && (
              <fieldset className="pj-funnel-settings">
                <legend>Etapas do funil</legend>
                <p>Selecione de 2 a 6 métricas na ordem desejada.</p>
                {(Object.keys(METRICS) as MetricKey[]).map((metric) => (
                  <label key={metric} className="pj-check">
                    <input
                      type="checkbox"
                      checked={funnelMetrics.includes(metric)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...funnelMetrics, metric].slice(0, 6)
                          : funnelMetrics.filter((item) => item !== metric);
                        if (next.length >= 2) patch({ funnel_metrics: next });
                      }}
                    />
                    {METRICS[metric].label}
                  </label>
                ))}
              </fieldset>
            )}
            <label>
              Análise do gestor
              <textarea
                rows={7}
                value={config.analysis}
                onChange={(e) => patch({ analysis: e.target.value })}
              />
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void action("save")}
            >
              Salvar alterações
            </button>
          </aside>
        )}
        <article className="pj-document">
          {doc.kind === "report" && (
            <header className="pj-report-cover">
              {logo ? (
                <img src={logo} alt={"Logo de " + clientName} />
              ) : (
                <span className="pj-project-avatar">
                  {clientName.slice(0, 1)}
                </span>
              )}
              <h1>{title}</h1>
              <h2>{config.subtitle}</h2>
              <p>
                Relatório de {clientName}
                <br />
                {shortDate(config.since)} a {shortDate(config.until)}
              </p>
              <span>LAOS · Resultados com contexto</span>
            </header>
          )}
          {editor && !preview ? (
            <div className="pj-canvas-actions">
              <span>Edite o relatório diretamente no canvas</span>
              <div>
                <button type="button" onClick={() => addSection("analysis")}>＋ Adicionar análise</button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setReplacingMetric("");
                    setMetricLibraryTab("predefined");
                    setMetricSearch("");
                    setMetricLibraryOpen(true);
                  }}
                >
                  ＋ Adicionar métricas
                </button>
              </div>
            </div>
          ) : null}
          <div className="pj-document-heading">
            <MetaMark />
            <div>
              <h2>{doc.kind === "report" ? "Meta Ads" : title}</h2>
              <p>
                {clientName} ·{" "}
                {config.campaign_ids.length
                  ? config.campaign_ids.length + " campanhas selecionadas"
                  : "Toda a conta"}
              </p>
            </div>
          </div>
          {data?.warnings.map((w) => (
            <p className="pj-warning" key={w}>
              {w}
            </p>
          ))}
          {data ? (
            config.sections.map((s) => (
              <div className={"pj-section pj-section-" + s} key={s}>
                {renderSection(s)}
              </div>
            ))
          ) : (
            <div className="pj-empty">
              <h3>Atualize os dados para continuar</h3>
              <p>
                As datas ou os filtros foram alterados. Importe os resultados
                antes de publicar.
              </p>
              {editable && !preview ? (
                <button type="button" className="primary" disabled={busy} onClick={() => void action("refresh")}>
                  {busy ? "Atualizando dados…" : "Atualizar dados"}
                </button>
              ) : null}
            </div>
          )}
          <footer className="pj-document-footer">
            Fonte: Meta Ads. Receita e conversões atribuídas pela plataforma;
            não somar automaticamente a outros canais. Valores em {currency}.
          </footer>
        </article>
      </div>
      {goalMetric ? (
        <Dialog title="Meta do indicador" close={() => setGoalMetric("")}>
          <p className="pj-dialog-intro">
            Defina quando este indicador será considerado saudável. O progresso aparece no card e é ocultado quando não houver uma meta.
          </p>
          <div className="pj-goal-kind">
            <button
              type="button"
              className={goalDraft.type === "target" ? "is-active" : ""}
              onClick={() => setGoalDraft((goal) => ({ ...goal, type: "target" }))}
            >
              <strong>Meta</strong>
              <span>Valor que deseja atingir</span>
            </button>
            <button
              type="button"
              className={goalDraft.type === "limit" ? "is-active" : ""}
              onClick={() => setGoalDraft((goal) => ({ ...goal, type: "limit" }))}
            >
              <strong>Limite</strong>
              <span>Valor que não deseja exceder</span>
            </button>
          </div>
          <label>
            Frequência
            <select
              value={goalDraft.cadence}
              onChange={(event) => setGoalDraft((goal) => ({ ...goal, cadence: event.target.value as MetricGoal["cadence"] }))}
            >
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="quarterly">Trimestral</option>
              <option value="semiannual">Semestral</option>
              <option value="annual">Anual</option>
            </select>
          </label>
          <label>
            Valor da {goalDraft.type === "target" ? "meta" : "limite"}
            <input
              data-autofocus
              type="number"
              min="0"
              step="any"
              value={goalDraft.value || ""}
              placeholder="Informe o valor"
              onChange={(event) => setGoalDraft((goal) => ({ ...goal, value: Number(event.target.value) }))}
            />
          </label>
          <label className="pj-check">
            <input
              type="checkbox"
              checked={goalDraft.autoRenew}
              onChange={(event) => setGoalDraft((goal) => ({ ...goal, autoRenew: event.target.checked }))}
            />
            Renovar automaticamente ao fim do período
          </label>
          <div className="pj-goal-preview">
            <span>Pré-visualização</span>
            <strong>{goalDraft.type === "target" ? "Meta recorrente" : "Limite recorrente"}</strong>
            <small>O acompanhamento usa o valor já validado pelo motor de métricas.</small>
          </div>
          <div className="pj-actions pj-actions-between">
            <button
              type="button"
              className="danger"
              disabled={!config.metric_goals?.[goalMetric]}
              onClick={() => {
                patch({
                  metric_goals: Object.fromEntries(
                    Object.entries(config.metric_goals ?? {}).filter(([metric]) => metric !== goalMetric),
                  ),
                });
                setGoalMetric("");
              }}
            >
              Remover meta
            </button>
            <button
              type="button"
              className="primary"
              disabled={!Number.isFinite(goalDraft.value) || goalDraft.value <= 0}
              onClick={() => {
                patch({ metric_goals: { ...(config.metric_goals ?? {}), [goalMetric]: goalDraft } });
                setGoalMetric("");
              }}
            >
              Salvar meta
            </button>
          </div>
        </Dialog>
      ) : null}
      {filterMetric ? (
        <Dialog title="Filtrar indicador por campanha" close={() => setFilterMetric("")}>
          <p className="pj-dialog-intro">
            O filtro vale somente para este card. Os demais indicadores continuam mostrando toda a conta.
          </p>
          {(() => {
            const metric = filterMetric in METRICS
              ? filterMetric as MetricKey
              : metricAliases[filterMetric];
            return metric && METRICS[metric].aggregation === "account_unique" ? (
              <p className="pj-warning">{METRICS[metric].label} não pode ser somado entre campanhas. Com filtro aplicado, o card exibirá “Sem dado” para evitar uma totalização incorreta.</p>
            ) : null;
          })()}
          <label className="pj-library-search">
            <span aria-hidden="true">⌕</span>
            <input
              data-autofocus
              value={campaignSearch}
              placeholder="Buscar campanha…"
              onChange={(event) => setCampaignSearch(event.target.value)}
            />
          </label>
          <div className="pj-campaign-filter-list">
            {(data?.campaigns ?? [])
              .filter((campaign) => campaign.name.toLocaleLowerCase("pt-BR").includes(campaignSearch.trim().toLocaleLowerCase("pt-BR")))
              .map((campaign) => (
                <label key={campaign.id}>
                  <input
                    type="checkbox"
                    checked={campaignSelection.includes(campaign.id)}
                    onChange={(event) => setCampaignSelection((selected) => event.target.checked
                      ? [...selected, campaign.id]
                      : selected.filter((id) => id !== campaign.id))}
                  />
                  <span><strong>{campaign.name}</strong><small>{formatMetric("spend", campaign.metrics.spend, currency)} investidos</small></span>
                </label>
              ))}
          </div>
          {!data?.campaigns.length ? <p className="pj-muted">Atualize os dados para carregar as campanhas disponíveis.</p> : null}
          <div className="pj-actions pj-actions-between">
            <button
              type="button"
              disabled={!config.metric_campaign_filters?.[filterMetric]?.length}
              onClick={() => {
                patch({
                  metric_campaign_filters: Object.fromEntries(
                    Object.entries(config.metric_campaign_filters ?? {}).filter(([metric]) => metric !== filterMetric),
                  ),
                });
                setFilterMetric("");
              }}
            >
              Limpar filtro
            </button>
            <button
              type="button"
              className="primary"
              disabled={!campaignSelection.length}
              onClick={() => {
                patch({
                  metric_campaign_filters: {
                    ...(config.metric_campaign_filters ?? {}),
                    [filterMetric]: campaignSelection,
                  },
                });
                setFilterMetric("");
              }}
            >
              Aplicar filtro
            </button>
          </div>
        </Dialog>
      ) : null}
      {dates && (
        <Dialog title="Período da análise" close={() => setDates(false)} busy={busy}>
          <label>
            Período
            <select
              value={config.preset}
              onChange={(e) => {
                const p = e.target.value as AnalysisConfig["preset"];
                patch({ preset: p, ...(p === "custom" ? {} : periodDates(p)) });
              }}
            >
              <option value="last_7d">Últimos 7 dias</option>
              <option value="last_30d">Últimos 30 dias</option>
              <option value="last_month">Último mês</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>
          <div className="pj-form-row">
            <label>
              De
              <input
                type="date"
                value={config.since}
                onChange={(e) =>
                  patch({ preset: "custom", since: e.target.value })
                }
              />
            </label>
            <label>
              Até
              <input
                type="date"
                value={config.until}
                onChange={(e) =>
                  patch({ preset: "custom", until: e.target.value })
                }
              />
            </label>
          </div>
          <label>
            Comparação
            <select
              value={config.comparison}
              onChange={(e) =>
                patch({
                  comparison: e.target.value as AnalysisConfig["comparison"],
                  ...comparisonDates(config),
                })
              }
            >
              <option value="previous">
                Período anterior
              </option>
              <option value="none">Não comparar</option>
              <option value="custom">Período personalizado</option>
            </select>
          </label>
          {config.comparison === "custom" && (
            <div>
              <div className="pj-form-row"><label>
                Comparar de
                <input
                  type="date"
                  value={config.compare_since ?? ""}
                  onChange={(e) => patch({ compare_since: e.target.value })}
                />
              </label>
              <label>
                Até
                <input
                  type="date"
                  value={config.compare_until ?? ""}
                  onChange={(e) => patch({ compare_until: e.target.value })}
                />
              </label></div>
              <p className="pj-muted">Use um período anterior, sem sobreposição, sem datas futuras e com a mesma duração do período atual.</p>
            </div>
          )}
          <div className="pj-actions">
            <button onClick={() => setDates(false)}>Fechar</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                await action("refresh");
                setDates(false);
              }}
            >
              Aplicar e atualizar
            </button>
          </div>
        </Dialog>
      )}
      {customMetricOpen && (
        <Dialog
          title={
            editingCustomId
              ? "Editar métrica personalizada"
              : "Adicionar métrica personalizada"
          }
          close={() => {
            setEditingCustomId("");
            setCustomMetricError("");
            setCustomMetricOpen(false);
          }}
        >
          <div className="pj-custom-kind">
            <button
              className={customMetric.kind === "manual" ? "primary" : ""}
              onClick={() =>
                setCustomMetric((metric) => ({ ...metric, kind: "manual", format: "number" }))
              }
            >
              Métrica manual
            </button>
            <button
              className={customMetric.kind === "calculated" ? "primary" : ""}
              onClick={() =>
                setCustomMetric((metric) => ({ ...metric, kind: "calculated", format: "ratio" }))
              }
            >
              Métrica calculada
            </button>
          </div>
          <label>
            Nome da métrica
            <input
              data-autofocus
              value={customMetric.label}
              maxLength={80}
              placeholder="Ex.: Taxa de conversão"
              aria-invalid={Boolean(customMetricError && !customMetric.label.trim())}
              aria-describedby="custom-metric-name-help"
              onChange={(event) =>
                setCustomMetric((metric) => ({
                  ...metric,
                  label: event.target.value,
                }))
              }
            />
            <FieldMessage id="custom-metric-name-help">
              Use um nome que deixe claro o que será medido.
            </FieldMessage>
          </label>
          <label>
            Descrição
            <input
              value={customMetric.description}
              maxLength={240}
              placeholder="Explique o que este indicador representa"
              aria-describedby="custom-metric-description-help"
              onChange={(event) =>
                setCustomMetric((metric) => ({
                  ...metric,
                  description: event.target.value,
                }))
              }
            />
            <FieldMessage id="custom-metric-description-help">
              Informe a origem e a interpretação para quem visualizar o documento.
            </FieldMessage>
          </label>
          <label>
            Formato
            <select
              value={customMetric.format}
              onChange={(event) =>
                setCustomMetric((metric) => ({
                  ...metric,
                  format: event.target.value as CustomMetricDefinition["format"],
                }))
              }
            >
              <option value="number">Número</option>
              <option value="money">Moeda</option>
              <option value="percent">Percentual</option>
              <option value="ratio">Índice</option>
            </select>
          </label>
          {customMetric.kind === "manual" ? (
            <label>
              Valor manual
              <input
                type="number"
                step="any"
                value={customMetric.value ?? 0}
                onChange={(event) =>
                  setCustomMetric((metric) => ({
                    ...metric,
                    value: Number(event.target.value),
                  }))
                }
              />
            </label>
          ) : (
            <>
              <div className="pj-form-row">
                <label>
                  Primeira métrica
                  <select
                    value={customMetric.left}
                    onChange={(event) =>
                      setCustomMetric((metric) => ({
                        ...metric,
                        left: event.target.value as MetricKey,
                      }))
                    }
                  >
                    {(Object.keys(METRICS) as MetricKey[]).map((metric) => (
                      <option key={metric} value={metric}>
                        {METRICS[metric].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Operação
                  <select
                    value={customMetric.operation}
                    onChange={(event) =>
                      setCustomMetric((metric) => ({
                        ...metric,
                        operation: event.target
                          .value as CustomMetricDefinition["operation"],
                      }))
                    }
                  >
                    <option value="divide">Dividir por</option>
                    <option value="percentage">Percentual de</option>
                    <option value="add">Somar com</option>
                    <option value="subtract">Subtrair</option>
                  </select>
                </label>
              </div>
              <label>
                Segunda métrica
                <select
                  value={customMetric.right}
                  onChange={(event) =>
                    setCustomMetric((metric) => ({
                      ...metric,
                      right: event.target.value as MetricKey,
                    }))
                  }
                >
                  {(Object.keys(METRICS) as MetricKey[]).map((metric) => (
                    <option key={metric} value={metric}>
                      {METRICS[metric].label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="pj-check">
            <input
              type="checkbox"
              checked={customMetric.lower ?? false}
              onChange={(event) =>
                setCustomMetric((metric) => ({
                  ...metric,
                  lower: event.target.checked,
                }))
              }
            />
            Menor valor representa melhora
          </label>
          {customMetricError && <FieldMessage error>{customMetricError}</FieldMessage>}
          <div className="pj-actions">
            <button
              onClick={() => {
                setEditingCustomId("");
                setCustomMetricError("");
                setCustomMetricOpen(false);
              }}
            >
              Cancelar
            </button>
            <button
              className="primary"
              disabled={!customMetric.label.trim()}
              onClick={saveCustomMetric}
            >
              {editingCustomId ? "Salvar métrica" : "Adicionar métrica"}
            </button>
          </div>
          <p className="pj-muted">
            Métricas manuais são identificadas como manuais. As calculadas usam
            apenas os dados já coletados para este documento.
          </p>
        </Dialog>
      )}
      {share && (
        <Dialog title="Compartilhar análise" close={() => setShare(false)}>
          <p>
            O link exige login e acesso autorizado ao projeto. Apenas documentos
            publicados ficam disponíveis para o cliente.
          </p>
          <input readOnly value={link} aria-label="Link do documento" />
          <div className="pj-share-grid">
            <button
              disabled={doc.status !== "published"}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setCopyError("");
                } catch {
                  setCopied(false);
                  setCopyError("Não foi possível copiar automaticamente. Selecione o endereço acima e copie manualmente.");
                }
              }}
            >
              {copied ? "Link copiado ✓" : "Copiar link"}
            </button>
            <button
              onClick={() => {
                setShare(false);
                setTimeout(() => window.print(), 100);
              }}
            >
              Salvar PDF / imprimir
            </button>
            {doc.status === "published" && (
              <>
                <a
                  className="pj-button"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    "https://wa.me/?text=" +
                    encodeURIComponent(doc.title + "\n" + link)
                  }
                >
                  Abrir WhatsApp
                </a>
                <a
                  className="pj-button"
                  href={
                    "mailto:?subject=" +
                    encodeURIComponent(doc.title) +
                    "&body=" +
                    encodeURIComponent("Confira a análise:\n" + link)
                  }
                >
                  Preparar e-mail
                </a>
              </>
            )}
          </div>
          {copyError ? <FieldMessage error>{copyError}</FieldMessage> : null}
          <p className="pj-muted">
            WhatsApp e e-mail abrem uma mensagem para você revisar e enviar. O
            acesso é controlado nas configurações do projeto.
          </p>
        </Dialog>
      )}
      {confirmDelete ? (
        <Dialog title="Excluir rascunho?" close={() => setConfirmDelete(false)} busy={busy}>
          <div className="pj-confirm-content">
            <p>
              O rascunho “{title}” será removido. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="pj-actions">
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Manter rascunho
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                await action("delete");
                setConfirmDelete(false);
              }}
            >
              {busy ? "Excluindo…" : "Excluir rascunho"}
            </button>
          </div>
        </Dialog>
      ) : null}
      {copied ? <Toast message="Link copiado para a área de transferência." close={() => setCopied(false)} /> : null}
    </div>
  );
}
