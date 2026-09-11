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
} from "@/lib/projects/model";
import { PRIMARY_KPI_IDS, isPrimaryKpiId, type MetricUnit, type PrimaryKpiId } from "@/lib/metrics/catalog";
import { inferCalculationFormat } from "@/lib/metrics/engine";
import { Dialog, MetaMark, shortDate } from "./ui";
import { LineChart } from "./line-chart";

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
    [copied, setCopied] = useState(false),
    [link, setLink] = useState(""),
    [draggedMetric, setDraggedMetric] = useState(""),
    [customMetricOpen, setCustomMetricOpen] = useState(false),
    [editingCustomId, setEditingCustomId] = useState(""),
    [customMetric, setCustomMetric] = useState(defaultCustomMetric()),
    [customMetricError, setCustomMetricError] = useState("");
  useEffect(() => {
    setConfig(normalizeAnalysisConfig(doc.config));
    setTitle(doc.title);
  }, [doc]);
  useEffect(
    () =>
      setLink(
        window.location.origin +
          "/?project=" +
          doc.client_id +
          "&document=" +
          doc.id +
          "&preview=1",
      ),
    [doc.id, doc.client_id],
  );
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
  const availableMetricIds = [
    ...config.metrics,
    ...customMetrics.map((metric) => metric.id),
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
    patch({
      metrics: config.metrics.map((metric) =>
        metric === current ? next : metric,
      ),
      metric_order: metricOrder.map((metric) =>
        metric === current ? next : metric,
      ),
      metric_sizes: sizes,
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
      metric_order: metricOrder.filter((metric) => metric !== id),
      metric_sizes: Object.fromEntries(
        Object.entries(config.metric_sizes ?? {}).filter(([metric]) => metric !== id),
      ),
    });
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
  const row = (items: InsightItem[], name: string) => (
    <div className="pj-table-scroll">
      <table>
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
      {!items.length && (
        <p className="pj-no-data">
          Sem dados disponíveis para este período e filtro.
        </p>
      )}
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
              const builtIn = id in METRICS ? (id as MetricKey) : null;
              if (!custom && !builtIn) return null;
              const definition = builtIn ? METRICS[builtIn] : custom!;
              const value = builtIn
                ? data.current[builtIn]
                : customMetricValue(custom!, data.current);
              const previous = builtIn
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
              return (
                <article
                  className={`pj-metric size-${size} ${editor && !preview ? "editable" : ""}`}
                  key={id}
                  onDragOver={(event) => {
                    if (editor && !preview) event.preventDefault();
                  }}
                  onDrop={() => reorderMetric(id)}
                >
                  {editor && !preview && (
                    <div className="pj-metric-controls">
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
                      {builtIn && (
                        <select
                          aria-label={`Trocar ${definition.label}`}
                          value={builtIn}
                          onChange={(event) =>
                            replaceMetric(builtIn, event.target.value as MetricKey)
                          }
                        >
                          {(Object.keys(METRICS) as MetricKey[]).map((metric) => (
                            <option
                              key={metric}
                              value={metric}
                              disabled={
                                (metric !== builtIn && config.metrics.includes(metric)) ||
                                (builtIn === config.primary_metric && !isPrimaryKpiId(metric))
                              }
                            >
                              {METRICS[metric].label}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        aria-label={`Alterar tamanho de ${definition.label}`}
                        title="Alternar entre compacto, largo e largura total"
                        onClick={() => resizeMetric(id)}
                      >
                        {size === "compact" ? "1×" : size === "wide" ? "2×" : "4×"}
                      </button>
                      <button
                        aria-label={`Remover ${definition.label}`}
                        disabled={builtIn != null && config.metrics.length <= 1}
                        onClick={() => removeMetric(id)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <span>
                    {definition.label}{" "}
                    <abbr title={definition.description || "Métrica personalizada"}>
                      ⓘ
                    </abbr>
                  </span>
                  <div>
                    <strong>{formatted}</strong>
                    {delta != null && (
                      <small
                        className={
                          (("favorableDirection" in definition
                            ? definition.favorableDirection === "decrease"
                            : definition.lower)
                            ? delta < 0
                            : delta > 0)
                            ? "positive"
                            : delta === 0
                              ? "neutral"
                              : "negative"
                        }
                      >
                        {delta > 0 ? "↑" : "↓"}{" "}
                        {Math.abs(delta).toFixed(1).replace(".", ",")}%
                      </small>
                    )}
                  </div>
                  {data.previous && previous != null && (
                    <p>{formattedPrevious} no período anterior</p>
                  )}
                  {data.previous && previous === 0 && value != null && (
                    <p>Sem base comparável no período anterior.</p>
                  )}
                </article>
              );
            })}
          </div>
        );
      case "daily": {
        return (
          <section className="pj-block">
            <h3>Investimento ao longo do período</h3>
            {data.daily.length ? (
              <>
                <LineChart
                  daily={data.daily}
                  metric="spend"
                  currency={currency}
                  color="#22c55e"
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
              <p>Sem dados diários neste período.</p>
            )}
          </section>
        );
      }
      case "results": {
        const metric = config.primary_metric;
        return (
          <section className="pj-block">
            <h3>{METRICS[metric].label} ao longo do período</h3>
            <LineChart
              daily={data.daily}
              metric={metric}
              currency={currency}
              color="#3b82f6"
            />
          </section>
        );
      }
      case "funnel": {
        return (
          <section className="pj-block">
            <h3>Etapas de resultado</h3>
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
            <h3>Campanhas em destaque</h3>
            {row(data.campaigns, "Campanha")}
          </section>
        );
      case "adsets":
        return (
          <section className="pj-block">
            <h3>Conjuntos de anúncios</h3>
            {row(data.adsets, "Conjunto")}
          </section>
        );
      case "ads":
        return (
          <section className="pj-block">
            <h3>Criativos e anúncios</h3>
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
            <h3>Desempenho por plataforma</h3>
            {row(data.platforms, "Plataforma")}
          </section>
        );
      case "audience":
        return (
          <section className="pj-block">
            <h3>Público por idade e gênero</h3>
            {row(data.audience, "Público")}
          </section>
        );
      case "analysis":
        return (
          <section className="pj-block">
            <h3>Análise e próximos passos</h3>
            <p className="pj-prose">
              {config.analysis || "Nenhuma análise adicionada pelo gestor."}
            </p>
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
          ← {preview ? clientName : "Voltar ao projeto"}
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
              <button aria-label="Mais ações" onClick={() => setMenu(!menu)}>
                •••
              </button>
              {menu && (
                <div className="pj-menu">
                  {editable && (
                    <button
                      onClick={() => {
                        setEditor(true);
                        setMenu(false);
                      }}
                    >
                      Configurações e blocos
                    </button>
                  )}
                  <button disabled={busy} onClick={() => void action("template")}>
                    Salvar como template
                  </button>
                  <button disabled={busy} onClick={() => void action("duplicate")}>
                    Duplicar {doc.kind === "dashboard" ? "dashboard" : "relatório"}
                  </button>
                  {doc.kind === "dashboard" && (
                    <button disabled={busy} onClick={() => void action("convert")}>
                      Converter em relatório
                    </button>
                  )}
                  <button disabled={busy} onClick={() => void action("timeline")}>
                    Adicionar à linha do tempo
                  </button>
                  {doc.kind === "dashboard" && doc.status === "published" && (
                    <button disabled={busy} onClick={() => void action("unpublish")}>
                      Restringir ao gestor
                    </button>
                  )}
                  {doc.status === "draft" && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Excluir este rascunho?"))
                          void action("delete");
                      }}
                    >
                      Excluir rascunho
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="pj-analysis-subbar">
        <button disabled={!editable || preview} onClick={() => setDates(true)}>
          ▣ {shortDate(data?.effective_period?.since ?? config.since)} — {shortDate(data?.effective_period?.until ?? config.until)}
          <small>
            {data?.previous
              ? `Comparação: ${shortDate(data.effective_period?.compare_since ?? compare.compare_since!)} a ${shortDate(data.effective_period?.compare_until ?? compare.compare_until!)}`
              : "Sem comparação"}
          </small>
        </button>
        <span>
          Meta Ads · {data?.timezone ?? "Conta do projeto"}
          <small>
            {data
              ? "Atualizado em " +
                new Date(data.updated_at).toLocaleString("pt-BR")
              : "Nenhuma atualização salva"}
          </small>
        </span>
        {staff && !preview && (
          <div className="pj-inline-actions">
            {doc.kind === "dashboard" && editable && (
              <label className="pj-check">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                Atualizar a cada 5 min
              </label>
            )}
            {editable && (
              <>
                <button disabled={busy} onClick={() => void action("refresh")}>
                  {busy ? "Atualizando…" : "↻ Atualizar dados"}
                </button>
                <button onClick={() => setEditor(!editor)}>
                  ✎ Editar blocos
                </button>
                <button
                  className="primary"
                  disabled={busy || !dirty}
                  onClick={() => void action("save")}
                >
                  Salvar
                </button>
              </>
            )}
            {doc.status === "draft" && (
              <button
                className="accent"
                disabled={busy || !data || dirty}
                onClick={() => void action("publish")}
              >
                Publicar para cliente
              </button>
            )}
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
            </div>
          )}
          <footer className="pj-document-footer">
            Fonte: Meta Ads. Receita e conversões atribuídas pela plataforma;
            não somar automaticamente a outros canais. Valores em {currency}.
          </footer>
        </article>
      </div>
      {dates && (
        <Dialog title="Período da análise" close={() => setDates(false)}>
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
              value={customMetric.label}
              maxLength={80}
              placeholder="Ex.: Taxa de conversão"
              onChange={(event) =>
                setCustomMetric((metric) => ({
                  ...metric,
                  label: event.target.value,
                }))
              }
            />
          </label>
          <label>
            Descrição
            <input
              value={customMetric.description}
              maxLength={240}
              placeholder="Explique o que este indicador representa"
              onChange={(event) =>
                setCustomMetric((metric) => ({
                  ...metric,
                  description: event.target.value,
                }))
              }
            />
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
          {customMetricError && <p className="pj-error">{customMetricError}</p>}
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
                } catch {
                  setCopied(false);
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
          <p className="pj-muted">
            WhatsApp e e-mail abrem uma mensagem para você revisar e enviar. O
            acesso é controlado nas configurações do projeto.
          </p>
        </Dialog>
      )}
    </div>
  );
}
