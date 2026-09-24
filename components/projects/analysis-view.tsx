/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import {
  METRICS,
  SECTIONS,
  formatMetric,
  normalizeAnalysisConfig,
  periodDates,
  comparisonDates,
  type AnalysisConfig,
  type ProjectDocument,
  type SectionKey,
  type MetricKey,
  type CustomMetricDefinition,
  type MetricSize,
  type MetricGoal,
} from "@/lib/projects/model";
import { PRIMARY_KPI_IDS, isPrimaryKpiId, type MetricUnit, type PrimaryKpiId } from "@/lib/metrics/catalog";
import { inferCalculationFormat } from "@/lib/metrics/engine";
import { Dialog, FieldMessage, MetaMark, Toast, shortDate } from "./ui";
import { deriveMetricCard, resolveMetricOrder } from "./metric-cards";
import { ReportBlock, SectionHeading, funnelMetricsFor } from "./report-blocks";
import { workspaceHref } from "@/lib/projects/routes";
import {
  REPORT_MESSAGE_TEMPLATES,
  buildReportMessage,
  reportTemplateAvailable,
  type ReportMessageInput,
  type ReportMessageTemplateId,
} from "@/lib/report-templates";
import { InterfaceIcon } from "./interface-icon";
import { ShareMenu } from "./share-menu";
import { reportMessageInputFromAnalysis } from "@/lib/report-templates/from-analysis";
import { clientPreviewPath, hasPublishedVersion, hasUnpublishedChanges } from "@/lib/projects/publication";
import ProgressMetricCard, {
  type CardSize,
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

const defaultMetricGoal = (): MetricGoal => ({
  type: "target",
  value: 0,
  cadence: "monthly",
  autoRenew: true,
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
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<ProjectDocument | undefined>;
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
    [reportCopyMenu, setReportCopyMenu] = useState(false),
    [reportCopied, setReportCopied] = useState(false),
    [reportCopyError, setReportCopyError] = useState(""),
    [link, setLink] = useState(""),
    [draggedMetric, setDraggedMetric] = useState(""),
    [dropTargetMetric, setDropTargetMetric] = useState(""),
    [resizingMetric, setResizingMetric] = useState(""),
    [resizePreview, setResizePreview] = useState<{ id: string; size: MetricSize } | null>(null),
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
  const reportCopyButtonRef = useRef<HTMLButtonElement>(null);
  const reportCopyMenuRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (!reportCopyMenu) return;
    const popover = reportCopyMenuRef.current;
    const items = Array.from(
      popover?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    items[0]?.focus();
    const closePopover = () => {
      setReportCopyMenu(false);
      reportCopyButtonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popover?.contains(target) && !reportCopyButtonRef.current?.contains(target)) {
        closePopover();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePopover();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [reportCopyMenu]);
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
  const metricOrder = resolveMetricOrder(config);
  const funnelMetrics = funnelMetricsFor(config);
  const replaceMetric = (current: MetricKey, next: MetricKey) => {
    if (current === next || config.metrics.includes(next)) return;
    if (config.primary_metric === current && !isPrimaryKpiId(next)) return;
    const sizes = { ...(config.metric_sizes ?? {}) };
    if (sizes[current]) {
      sizes[next] = sizes[current];
      delete sizes[current];
    }
    const moveRecordKey = <T,>(record: Record<string, T> | undefined) => {
      if (!record || !Object.prototype.hasOwnProperty.call(record, current)) return record ?? {};
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
      metric_charts: moveRecordKey(config.metric_charts),
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
      metric_charts: Object.fromEntries(
        Object.entries(config.metric_charts ?? {}).filter(([metric]) => metric !== id),
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
      metric_charts: {
        ...(config.metric_charts ?? {}),
        [copyId]: config.metric_charts?.[id] ?? true,
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
  const toggleMetricChart = (id: string) => {
    const charts = { ...(config.metric_charts ?? {}) };
    if (charts[id] === false) delete charts[id];
    else charts[id] = false;
    patch({ metric_charts: charts });
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
  const reorderMetric = (target: string, source = draggedMetric) => {
    if (!source || source === target) return;
    const targetIndex = metricOrder.indexOf(target);
    if (targetIndex < 0) return;
    const next = metricOrder.filter((metric) => metric !== source);
    next.splice(targetIndex, 0, source);
    patch({ metric_order: next });
    setDraggedMetric("");
    setDropTargetMetric("");
  };
  const resizeMetric = (id: string) => {
    const current = config.metric_sizes?.[id] ?? "compact";
    const next: MetricSize =
      current === "compact" ? "wide" : current === "wide" ? "full" : "compact";
    patch({
      metric_sizes: { ...(config.metric_sizes ?? {}), [id]: next },
    });
  };
  const startMetricDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const wrapper = handle.closest<HTMLElement>(".pj-progress-metric-item");
    if (!wrapper) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const sourceRect = wrapper.getBoundingClientRect();
    let active = false;
    let target = "";
    let targetRect: DOMRect | null = null;
    let offsetX = 0;
    let offsetY = 0;
    setSelectedMetric(id);
    handle.setPointerCapture(pointerId);
    const cleanupListeners = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    };
    const cleanupStyles = () => {
      wrapper.style.removeProperty("transform");
      wrapper.style.removeProperty("transition");
      wrapper.style.removeProperty("will-change");
      wrapper.style.removeProperty("z-index");
      wrapper.style.removeProperty("pointer-events");
    };
    const settle = (commit: boolean) => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const endX = commit && targetRect ? targetRect.left - sourceRect.left : 0;
      const endY = commit && targetRect ? targetRect.top - sourceRect.top : 0;
      const complete = () => {
        if (commit && target) flushSync(() => reorderMetric(target, id));
        else {
          setDraggedMetric("");
          setDropTargetMetric("");
        }
        cleanupStyles();
      };
      if (reduceMotion) {
        complete();
        return;
      }
      const animation = wrapper.animate(
        [
          { transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(0.985)`, opacity: 0.94 },
          { transform: `translate3d(${endX}px, ${endY}px, 0) scale(${commit ? 0.985 : 1})`, opacity: 0.94 },
        ],
        { duration: 180, easing: "cubic-bezier(0.77, 0, 0.175, 1)", fill: "forwards" },
      );
      let settled = false;
      animation.addEventListener("finish", () => {
        if (settled) return;
        settled = true;
        animation.cancel();
        complete();
      }, { once: true });
      animation.addEventListener("cancel", () => {
        if (settled) return;
        settled = true;
        complete();
      }, { once: true });
    };
    const onMove = (pointerEvent: PointerEvent) => {
      offsetX = pointerEvent.clientX - startX;
      offsetY = pointerEvent.clientY - startY;
      const distance = Math.hypot(offsetX, offsetY);
      if (!active && distance < 6) return;
      if (!active) {
        active = true;
        setDraggedMetric(id);
        wrapper.style.transition = "none";
        wrapper.style.willChange = "transform";
        wrapper.style.zIndex = "40";
        wrapper.style.pointerEvents = "none";
      }
      pointerEvent.preventDefault();
      wrapper.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(0.985)`;
      const targetCard = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest<HTMLElement>("[data-metric-id]");
      const nextTarget = targetCard?.dataset.metricId ?? "";
      target = nextTarget && nextTarget !== id ? nextTarget : "";
      targetRect = target ? targetCard!.getBoundingClientRect() : null;
      setDropTargetMetric(target);
    };
    const finish = () => {
      cleanupListeners();
      if (active) settle(Boolean(target && targetRect));
      else cleanupStyles();
    };
    const cancel = () => {
      cleanupListeners();
      if (active) settle(false);
      else cleanupStyles();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };
  const startMetricResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const wrapper = handle.closest<HTMLElement>(".pj-progress-metric-item");
    const sizes: MetricSize[] = ["compact", "wide", "full"];
    const current = config.metric_sizes?.[id] ?? "compact";
    const currentIndex = sizes.indexOf(current);
    let preview = current;
    setSelectedMetric(id);
    setResizingMetric(id);
    setResizePreview({ id, size: current });
    handle.setPointerCapture(pointerId);
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (wrapper) delete wrapper.dataset.resizePreview;
      setResizingMetric("");
      setResizePreview(null);
    };
    const onMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      const delta = pointerEvent.clientX - startX;
      const step = delta > 24 ? 1 : delta < -24 ? -1 : 0;
      const next = sizes[Math.max(0, Math.min(sizes.length - 1, currentIndex + step))];
      if (next !== preview) {
        preview = next;
        setResizePreview({ id, size: preview });
      }
      if (wrapper) {
        wrapper.dataset.resizePreview = preview === "compact" ? "compacto" : preview === "wide" ? "largo" : "completo";
      }
    };
    const finish = () => {
      cleanup();
      if (preview !== current) {
        patch({
          metric_sizes: { ...(config.metric_sizes ?? {}), [id]: preview },
        });
      }
    };
    const cancel = () => cleanup();
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
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
    return onAction(
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
  // "Ver como cliente": dashboards open the private, read-only client view of the
  // CURRENT saved version in a new tab (it never creates a public link and never
  // exposes a draft). Other document kinds keep the authenticated app preview.
  const viewAsClient = () => {
    const target = doc.kind === "dashboard"
      ? `${window.location.origin}${clientPreviewPath(doc.client_id, doc.id)}`
      : link;
    window.open(target, "_blank", "noopener,noreferrer");
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
  const reportMessageInput: ReportMessageInput | null = data
    ? reportMessageInputFromAnalysis({
        clientName,
        data,
        period: {
          since: effectiveSince,
          until: effectiveUntil,
          compareSince: effectiveCompareSince,
          compareUntil: effectiveCompareUntil,
        },
        primaryMetric: config.primary_metric,
        metrics: config.metrics,
        comparisonEnabled: config.comparison !== "none",
      })
    : null;
  const copyReport = async (templateId: ReportMessageTemplateId) => {
    if (!reportMessageInput) return;
    try {
      await navigator.clipboard.writeText(buildReportMessage(templateId, reportMessageInput));
      setReportCopyMenu(false);
      setReportCopyError("");
      setReportCopied(true);
      reportCopyButtonRef.current?.focus();
    } catch {
      setReportCopyError(
        "Não foi possível copiar automaticamente. Verifique a permissão da área de transferência e tente novamente.",
      );
    }
  };
  function renderSection(section: SectionKey) {
    if (!data) return null;
    switch (section) {
      case "metrics":
        return (
          <div className="pj-metric-grid">
            {metricOrder.map((id) => {
              const model = deriveMetricCard(id, config, data, currency);
              if (!model) return null;
              const builtIn = id in METRICS ? (id as MetricKey) : metricAliases[id] ?? null;
              const campaignIds = config.metric_campaign_filters?.[id] ?? [];
              const showChart = model.props.showChart;
              const label = model.props.title;
              const size = resizePreview?.id === id ? resizePreview.size : model.savedSize;
              const cardSize: CardSize = size === "full" ? "lg" : size === "wide" ? "md" : "sm";
              return (
                <div
                  className={`pj-progress-metric-item size-${size} ${id === config.primary_metric ? "is-primary" : ""} ${selectedMetric === id ? "is-selected" : ""} ${draggedMetric === id ? "is-dragging" : ""} ${dropTargetMetric === id ? "is-drop-target" : ""} ${resizingMetric === id ? "is-resizing" : ""}`}
                  key={id}
                  data-metric-id={id}
                  data-size={size}
                  onClick={(event) => {
                    if (!editor || preview) return;
                    if ((event.target as HTMLElement).closest("button, select, input, a")) return;
                    setSelectedMetric(id);
                  }}
                  onDragOver={(event) => {
                    if (editor && !preview && draggedMetric && draggedMetric !== id) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropTargetMetric(id);
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setDropTargetMetric((current) => current === id ? "" : current);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const source = event.dataTransfer.getData("application/x-laos-metric") || draggedMetric;
                    reorderMetric(id, source);
                  }}
                >
                  <ProgressMetricCard
                    {...model.props}
                    size={cardSize}
                    controls={editor && !preview && selectedMetric === id ? (
                      <div className="pj-metric-controls" role="toolbar" aria-label={`Editar ${label}`}>
                        <button
                          className="pj-drag-handle"
                          aria-label={`Arrastar ${label}`}
                          title="Segure e arraste para reordenar"
                          onPointerDown={(event) => startMetricDrag(event, id)}
                        >
                          <InterfaceIcon name="grip" size={18} />
                        </button>
                        <button
                          className={(config.featured_metrics ?? []).includes(id) ? "is-active" : ""}
                          aria-label={`${(config.featured_metrics ?? []).includes(id) ? "Remover destaque de" : "Destacar"} ${label}`}
                          title="Destacar"
                          onClick={() => toggleFeatured(id)}
                        >
                          <InterfaceIcon name={(config.featured_metrics ?? []).includes(id) ? "star-filled" : "star"} size={18} />
                        </button>
                        {builtIn ? (
                          <button aria-label={`Duplicar ${label}`} title="Duplicar" onClick={() => duplicateMetric(id, builtIn)}><InterfaceIcon name="copy" size={18} /></button>
                        ) : null}
                        {builtIn ? (
                          <button
                            aria-label={`Trocar ${label}`}
                            title="Trocar métrica"
                            onClick={() => {
                              setReplacingMetric(id);
                              setMetricLibraryTab("predefined");
                              setMetricSearch("");
                              setMetricLibraryOpen(true);
                            }}
                          >
                            <InterfaceIcon name="settings" size={18} />
                          </button>
                        ) : null}
                        <button aria-label={`Definir meta para ${label}`} title="Meta ou limite" onClick={() => openMetricGoal(id)}><InterfaceIcon name="goals" size={18} /></button>
                        {builtIn ? (
                          <button
                            className={campaignIds.length ? "is-active" : ""}
                            aria-label={`Filtrar ${label} por campanha`}
                            title="Filtrar por campanha"
                            onClick={() => openCampaignFilter(id)}
                          >
                            <InterfaceIcon name="filter" size={18} />
                          </button>
                        ) : null}
                        <button
                          className={showChart ? "is-active" : ""}
                          aria-label={`${showChart ? "Ocultar" : "Exibir"} gráfico de ${label}`}
                          aria-pressed={showChart}
                          title={showChart ? "Ocultar gráfico" : "Exibir gráfico"}
                          onClick={() => toggleMetricChart(id)}
                        >
                          <InterfaceIcon name="chart-line" size={18} />
                        </button>
                        <button
                          aria-label={`Alterar tamanho de ${label}`}
                          title="Alternar entre compacto, largo e largura total"
                          onClick={() => resizeMetric(id)}
                        >
                          {size === "compact" ? "1×" : size === "wide" ? "2×" : "4×"}
                        </button>
                        <button
                          className="danger"
                          aria-label={`Remover ${label}`}
                          disabled={builtIn != null && config.metrics.length <= 1}
                          onClick={() => removeMetric(id)}
                        >
                          <InterfaceIcon name="delete" size={18} />
                        </button>
                      </div>
                    ) : undefined}
                  />
                  {editor && !preview && selectedMetric === id ? (
                    <button
                      type="button"
                      className="pj-resize-handle"
                      aria-label={`Redimensionar ${label}`}
                      title="Arraste para a esquerda ou direita para alterar o tamanho"
                      onPointerDown={(event) => startMetricResize(event, id)}
                    >
                      <InterfaceIcon name="resize" size={18} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      case "daily":
      case "results":
      case "funnel":
      case "campaigns":
      case "adsets":
      case "ads":
      case "platforms":
      case "audience":
        return <ReportBlock section={section} config={config} data={data} currency={currency} busy={busy} />;
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
          <InterfaceIcon name="back" size={18} />
          <span>{preview ? clientName : "Voltar ao projeto"}</span>
        </button>
        <strong>{title}</strong>
        <span className="pj-badge">
          {hasUnpublishedChanges(doc)
            ? "Publicado · alterações não publicadas"
            : doc.status === "published" ? "Publicado" : "Rascunho"}
        </span>
        <div className="pj-toolbar-right">
          {staff && preview && (
            <button onClick={() => setPreview(!preview)}>
              Voltar à edição
            </button>
          )}
          {staff && !preview && (
            <button type="button" className="pj-button" onClick={viewAsClient}>
              Ver como cliente
              <InterfaceIcon name="external" size={18} />
            </button>
          )}
          {staff && doc.kind === "dashboard" && (
            <ShareMenu
              doc={doc}
              clientName={clientName}
              busy={busy}
              onAction={(a) => action(a)}
            />
          )}
          <div className="pj-copy-report">
            <button
              ref={reportCopyButtonRef}
              disabled={!reportMessageInput}
              aria-haspopup="menu"
              aria-expanded={reportCopyMenu}
              aria-controls="copy-report-menu"
              title="Copiar relatório"
              onClick={() => {
                setReportCopyError("");
                setReportCopyMenu((open) => !open);
              }}
            >
              <InterfaceIcon name="copy" size={18} />
              Copiar relatório
            </button>
            {reportCopyMenu ? (
              <div
                ref={reportCopyMenuRef}
                className="pj-copy-report-menu"
                id="copy-report-menu"
                role="menu"
                aria-label="Modelos para copiar relatório"
              >
                <header>
                  <strong>Escolha um modelo</strong>
                  <span>O texto usa somente os dados exibidos.</span>
                </header>
                {REPORT_MESSAGE_TEMPLATES.map((template) => {
                  const available = reportMessageInput
                    ? reportTemplateAvailable(template, reportMessageInput)
                    : false;
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      key={template.id}
                      disabled={!available}
                      onClick={() => void copyReport(template.id)}
                    >
                      <InterfaceIcon
                        name={
                          template.id === "sales"
                            ? "sales"
                            : template.id === "messages"
                              ? "messages"
                              : template.id === "followers"
                                ? "followers"
                                : template.id === "traffic"
                                  ? "link"
                                  : "reports"
                        }
                        size={18}
                      />
                      <span>
                        <strong>{template.label}</strong>
                        <small>{available ? template.description : "Sem métricas compatíveis neste documento"}</small>
                      </span>
                    </button>
                  );
                })}
                {reportCopyError ? <p role="alert">{reportCopyError}</p> : null}
              </div>
            ) : null}
          </div>
          {!(staff && doc.kind === "dashboard") && (
            <button onClick={() => setShare(true)}>
              <InterfaceIcon name="share" size={18} />
              Compartilhar
            </button>
          )}
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
                <InterfaceIcon name="more" />
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
                  {doc.kind === "dashboard" && (doc.status === "published" || hasPublishedVersion(doc)) && (
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
            className="pj-period-trigger"
            disabled={!editable || preview}
            onClick={() => setDates(true)}
            aria-label={`Alterar período atual: ${shortDate(effectiveSince)} a ${shortDate(effectiveUntil)}`}
          >
            <InterfaceIcon name="calendar" size={20} />
            <span>
              <small>Período</small>
              <strong>{shortDate(effectiveSince)} — {shortDate(effectiveUntil)}</strong>
            </span>
            {editable && !preview ? <InterfaceIcon name="chevron-down" size={18} /> : null}
          </button>
          <dl className="pj-period-summary" aria-label="Período da análise">
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
                <InterfaceIcon name="refresh" size={18} />
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
                <InterfaceIcon name="edit" size={18} />
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
              {(doc.status === "draft" || hasUnpublishedChanges(doc)) && (
                <button
                  className={!dirty ? "primary" : ""}
                  disabled={busy || !data || dirty}
                  onClick={() => void action("publish")}
                >
                  {hasPublishedVersion(doc) ? "Publicar alterações" : "Publicar"}
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
                <InterfaceIcon name="close" size={18} />
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
                  <InterfaceIcon name="search" size={18} />
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
                <button type="button" onClick={() => addSection("analysis")}><span><InterfaceIcon name="edit" /></span><b>Análise</b><small>Texto com aprendizados e próximos passos</small></button>
                <button type="button" onClick={() => addSection("funnel")}><span><InterfaceIcon name="filter" /></span><b>Funil</b><small>Conversão entre as etapas escolhidas</small></button>
                <button type="button" onClick={() => addSection("results")}><span><InterfaceIcon name="chart-line" /></span><b>Gráfico</b><small>Evolução do indicador principal</small></button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricLibraryOpen(false);
                    setEditingCustomId("");
                    setCustomMetricError("");
                    setCustomMetric({ ...defaultCustomMetric(), kind: "calculated", format: "ratio" });
                    setCustomMetricOpen(true);
                  }}
                ><span><InterfaceIcon name="calculator" /></span><b>Métrica calculada</b><small>Combine duas métricas do catálogo</small></button>
                <button
                  type="button"
                  onClick={() => {
                    setMetricLibraryOpen(false);
                    setEditingCustomId("");
                    setCustomMetricError("");
                    setCustomMetric(defaultCustomMetric());
                    setCustomMetricOpen(true);
                  }}
                ><span><InterfaceIcon name="edit" /></span><b>Métrica manual</b><small>Informe um valor próprio</small></button>
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
              <InterfaceIcon name="plus" size={18} /> Métrica manual ou calculada
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
                      <InterfaceIcon name="edit" size={18} />
                    </button>
                    <button
                      className="danger"
                      aria-label={`Remover ${metric.label}`}
                      onClick={() => removeMetric(metric.id)}
                    >
                      <InterfaceIcon name="delete" size={18} />
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
                  <InterfaceIcon name="up" size={18} />
                </button>
                <button
                  aria-label={"Mover " + SECTIONS[k] + " abaixo"}
                  disabled={i === config.sections.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <InterfaceIcon name="down" size={18} />
                </button>
                <button
                  className="danger"
                  aria-label={"Remover " + SECTIONS[k]}
                  onClick={() =>
                    patch({ sections: config.sections.filter((x) => x !== k) })
                  }
                >
                  <InterfaceIcon name="delete" size={18} />
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
                <button type="button" onClick={() => addSection("analysis")}><InterfaceIcon name="plus" size={18} /> Adicionar análise</button>
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
                  <InterfaceIcon name="plus" size={18} /> Adicionar métricas
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
            <InterfaceIcon name="search" size={18} />
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
          <fieldset className="pj-period-presets">
            <legend>Atalhos de período</legend>
            {([
              ["last_7d", "7 dias"],
              ["last_30d", "30 dias"],
              ["last_90d", "3 meses"],
              ["last_180d", "6 meses"],
              ["current_month", "Mês atual"],
              ["last_month", "Mês anterior"],
              ["custom", "Personalizado"],
            ] as const).map(([preset, label]) => (
              <button
                type="button"
                key={preset}
                className={config.preset === preset ? "is-active" : ""}
                aria-pressed={config.preset === preset}
                onClick={() => patch({
                  preset,
                  ...(preset === "custom" ? {} : periodDates(preset)),
                })}
              >
                {label}
              </button>
            ))}
          </fieldset>
          {config.preset === "custom" ? <div className="pj-form-row">
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
          </div> : (
            <p className="pj-period-selected" aria-live="polite">
              <InterfaceIcon name="calendar" size={18} />
              {shortDate(config.since)} — {shortDate(config.until)}
            </p>
          )}
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
      {reportCopied ? <Toast message="Relatório copiado" close={() => setReportCopied(false)} /> : null}
    </div>
  );
}
