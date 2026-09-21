"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ACCENTS,
  formatCompact,
  MetricChart,
  SERIES_COLORS,
  type ChartSeries,
  type ChartView,
  type MetricAccent,
  type MetricSeries,
  type SeriesPoint,
} from "./metric-chart";
import { PeriodSelect, ViewToggle, type PeriodOption } from "./metric-controls";
import styles from "./progress-metric-card.module.css";

export type { SeriesPoint, MetricSeries, MetricAccent, ChartView, PeriodOption };

export type CardSize = "sm" | "md" | "lg";

export interface ProgressMetricCardProps {
  title: string;
  description?: string;
  total: string | number;
  percent?: string;
  trend?: "up" | "down" | "flat";
  statusLabel?: string;
  comparisonLabel?: string;
  period: string;
  unitLabel?: string;
  periodOptions?: PeriodOption[];
  onPeriodChange?: (option: PeriodOption) => void;
  defaultView?: ChartView;
  accent?: MetricAccent;
  data?: SeriesPoint[];
  series?: MetricSeries[];
  defaultIndex?: number;
  size?: CardSize;
  showChart?: boolean;
  showStats?: boolean;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
  loading?: boolean;
  featured?: boolean;
  highlighted?: boolean;
  goal?: {
    label: string;
    valueLabel: string;
    progress: number;
    status: string;
  };
  controls?: ReactNode;
  className?: string;
}

const sliceWindow = (points: SeriesPoint[], pointCount?: number) =>
  pointCount && pointCount < points.length ? points.slice(-pointCount) : points;

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  const path = trend === "up" ? "M5 15 15 5m0 0H8m7 0v7" : trend === "down" ? "M5 5l10 10m0 0H8m7 0V8" : "M4 10h12";
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function ProgressMetricCard({
  title,
  description,
  total,
  percent,
  trend = "flat",
  statusLabel = "Sem base comparável",
  comparisonLabel = "Comparação indisponível",
  period,
  unitLabel,
  periodOptions,
  onPeriodChange,
  defaultView = "curve",
  accent = "blue",
  data,
  series,
  defaultIndex,
  size = "sm",
  showChart = true,
  showStats = true,
  valueFormatter = formatCompact,
  dateFormatter = (date) => date,
  loading = false,
  featured = false,
  highlighted = false,
  goal,
  controls,
  className = "",
}: ProgressMetricCardProps) {
  const [selectedPeriodOverride, setSelectedPeriodOverride] = useState<string | null>(null);
  const [view, setView] = useState<ChartView>(defaultView);
  const color = ACCENTS[accent];

  const baseSeries = useMemo<MetricSeries[]>(
    () => (series?.length ? series : [{ name: title, data: data ?? [], accent }]),
    [accent, data, series, title],
  );
  const selectedPeriod = selectedPeriodOverride && periodOptions?.some((option) => option.label === selectedPeriodOverride)
    ? selectedPeriodOverride
    : period;
  const selectedOption = periodOptions?.find((option) => option.label === selectedPeriod);
  const visibleSeries = useMemo(
    () => baseSeries.map((item) => ({ ...item, data: sliceWindow(item.data, selectedOption?.points) })),
    [baseSeries, selectedOption?.points],
  );
  const stats = useMemo(() => {
    const primaryValues = visibleSeries[0]?.data.map((point) => point.value) ?? [];
    if (!primaryValues.length) return null;
    let peak = primaryValues[0];
    let low = primaryValues[0];
    let sum = 0;
    for (const value of primaryValues) {
      peak = Math.max(peak, value);
      low = Math.min(low, value);
      sum += value;
    }
    return { peak, low, average: sum / primaryValues.length };
  }, [visibleSeries]);
  const chartSeries: ChartSeries[] = visibleSeries.map((item, index) => ({
    name: item.name,
    data: item.data,
    color: item.accent
      ? ACCENTS[item.accent].stroke
      : visibleSeries.length > 1
        ? SERIES_COLORS[index % SERIES_COLORS.length]
        : color.stroke,
  }));
  const classNames = [
    styles.card,
    styles[size],
    !showChart ? styles.chartless : "",
    featured ? styles.featured : "",
    highlighted ? styles.highlighted : "",
    className,
  ].filter(Boolean).join(" ");

  if (loading) {
    return (
      <article className={classNames} aria-busy="true" aria-label={`Carregando ${title}`}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonValue} />
        <div className={styles.skeletonChart} />
        <div className={styles.skeletonFooter} />
      </article>
    );
  }

  return (
    <article className={classNames} style={{ "--metric-accent": color.stroke, "--metric-soft": color.soft } as CSSProperties}>
      <div className={styles.glow} aria-hidden="true" />
      {controls ? <div className={styles.controlsSlot}>{controls}</div> : null}

      <div className={styles.body}>
        <div className={styles.valueArea}>
          {featured ? <span className={styles.primaryLabel}>KPI principal</span> : null}
          <strong className={styles.total}>{total}</strong>
          <div className={styles.metricIdentity}>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <span className={styles.trend}>
            <TrendIcon trend={trend} />
            {statusLabel}{percent ? ` · ${percent}` : ""}
          </span>
          <span className={styles.comparison}>{comparisonLabel}</span>
          <div className={styles.context}>
            <PeriodSelect
              value={selectedPeriod}
              options={periodOptions}
              onChange={(option) => {
                setSelectedPeriodOverride(option.label);
                onPeriodChange?.(option);
              }}
            />
            {unitLabel ? <span>Unidade: {unitLabel}</span> : null}
          </div>
          {goal ? (
            <div className={styles.goal} aria-label={`${goal.label}: ${goal.status}`}>
              <div>
                <span>{goal.label}</span>
                <strong>{goal.valueLabel}</strong>
              </div>
              <div className={styles.goalTrack} aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(goal.progress, 100))}%` }} />
              </div>
              <small>{goal.status}</small>
            </div>
          ) : null}
        </div>
        {showChart ? (
          <div className={styles.chartArea}>
            <div className={styles.dotPattern} aria-hidden="true" />
            <div className={styles.chartHeader}>
              <span><i aria-hidden="true" /> Evolução diária</span>
              <ViewToggle value={view} onChange={setView} />
            </div>
            <MetricChart
              series={chartSeries}
              view={view}
              defaultIndex={defaultIndex}
              valueFormatter={valueFormatter}
              dateFormatter={dateFormatter}
            />
          </div>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerContext}>Resumo do período</span>
        {showStats && stats ? (
          <div className={styles.stats} aria-label="Resumo da série diária">
            <span><b>{valueFormatter(stats.peak)}</b> pico</span>
            <i>·</i>
            <span><b>{valueFormatter(stats.low)}</b> menor</span>
            <i>·</i>
            <span><b>{valueFormatter(stats.average)}</b> média</span>
          </div>
        ) : (
          <span className={styles.noStats}>Sem estatísticas diárias</span>
        )}
      </footer>
    </article>
  );
}
