"use client";

import { useId, useMemo, useState } from "react";
import styles from "./progress-metric-card.module.css";

export type ChartView = "curve" | "bars";
export type MetricAccent = "blue" | "emerald" | "rose" | "amber" | "neutral";

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface MetricSeries {
  name: string;
  data: SeriesPoint[];
  accent?: MetricAccent;
}

export interface ChartSeries {
  name: string;
  data: SeriesPoint[];
  color: string;
}

export const ACCENTS: Record<MetricAccent, { stroke: string; text: string; soft: string }> = {
  blue: {
    stroke: "var(--pj-primary, #3b82f6)",
    text: "var(--pj-primary, #3b82f6)",
    soft: "var(--pj-primary-soft, rgb(59 130 246 / 0.12))",
  },
  emerald: {
    stroke: "var(--pj-success, #22c55e)",
    text: "var(--pj-success, #22c55e)",
    soft: "var(--pj-success-soft, rgb(34 197 94 / 0.12))",
  },
  rose: {
    stroke: "var(--pj-danger, #ef4444)",
    text: "var(--pj-danger, #ef4444)",
    soft: "var(--pj-danger-soft, rgb(239 68 68 / 0.12))",
  },
  amber: {
    stroke: "var(--pj-warning, #f59e0b)",
    text: "var(--pj-warning, #f59e0b)",
    soft: "var(--pj-warning-soft, rgb(245 158 11 / 0.12))",
  },
  neutral: {
    stroke: "var(--pj-text-muted, #74839a)",
    text: "var(--pj-text-secondary, #94a3b8)",
    soft: "var(--pj-surface-sunken, rgb(100 116 139 / 0.12))",
  },
};

export const SERIES_COLORS = [
  "var(--pj-primary, #3b82f6)",
  "var(--pj-success, #22c55e)",
  "var(--pj-warning, #f59e0b)",
  "var(--pj-beta, #a855f7)",
];

export const formatCompact = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
  }).format(value);

const WIDTH = 640;
const HEIGHT = 250;
const PAD_X = 26;
const PAD_Y = 24;

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

export function MetricChart({
  series,
  view,
  defaultIndex,
  valueFormatter = formatCompact,
  dateFormatter = (date) => date,
}: {
  series: ChartSeries[];
  view: ChartView;
  defaultIndex?: number;
  valueFormatter?: (value: number) => string;
  dateFormatter?: (date: string) => string;
}) {
  const gradientId = `metric-gradient-${useId().replaceAll(":", "")}`;
  const pointCount = Math.max(...series.map((item) => item.data.length), 0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const values = series.flatMap((item) => item.data.map((point) => point.value));
    const minimum = Math.min(...values, 0);
    const maximum = Math.max(...values, 1);
    const range = Math.max(maximum - minimum, 1);
    const innerWidth = WIDTH - PAD_X * 2;
    const innerHeight = HEIGHT - PAD_Y * 2;

    return series.map((item) => ({
      ...item,
      points: item.data.map((point, index) => ({
        ...point,
        x: PAD_X + (index * innerWidth) / Math.max(pointCount - 1, 1),
        y: PAD_Y + innerHeight - ((point.value - minimum) / range) * innerHeight,
      })),
    }));
  }, [pointCount, series]);

  if (!pointCount) {
    return (
      <div className={styles.chartEmpty} role="status">
        Sem histórico diário para esta métrica.
      </div>
    );
  }

  const primary = chart[0];
  const preferredIndex = activeIndex ?? defaultIndex ?? pointCount - 1;
  const safeIndex = Math.max(0, Math.min(preferredIndex, Math.max(primary.points.length - 1, 0)));
  const activePoint = primary.points[safeIndex];
  const activeX = activePoint?.x ?? PAD_X;
  const updateFromPointer = (clientX: number, currentTarget: HTMLDivElement) => {
    const bounds = currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    setActiveIndex(Math.round(ratio * Math.max(pointCount - 1, 0)));
  };

  return (
    <div
      className={styles.chart}
      tabIndex={0}
      role="group"
      aria-label={`Série histórica de ${primary.name}. Use as setas para navegar pelos dias.`}
      onPointerMove={(event) => updateFromPointer(event.clientX, event.currentTarget)}
      onPointerDown={(event) => updateFromPointer(event.clientX, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setActiveIndex(Math.max(0, safeIndex - 1));
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setActiveIndex(Math.min(pointCount - 1, safeIndex + 1));
        }
      }}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={primary.color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            className={styles.chartGrid}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_Y + (HEIGHT - PAD_Y * 2) * ratio}
            y2={PAD_Y + (HEIGHT - PAD_Y * 2) * ratio}
          />
        ))}

        {view === "curve" ? (
          <>
            {primary.points.length > 1 ? (
              <path
                d={`${smoothPath(primary.points)} L ${primary.points.at(-1)?.x ?? WIDTH - PAD_X} ${HEIGHT - PAD_Y} L ${primary.points[0].x} ${HEIGHT - PAD_Y} Z`}
                fill={`url(#${gradientId})`}
              />
            ) : null}
            {chart.map((item) => (
              <path
                key={item.name}
                d={smoothPath(item.points)}
                fill="none"
                stroke={item.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            ))}
          </>
        ) : (
          primary.points.map((point, index) => {
            const barWidth = Math.max(5, Math.min(24, (WIDTH - PAD_X * 2) / pointCount - 5));
            return (
              <rect
                key={`${point.date}-${index}`}
                x={point.x - barWidth / 2}
                y={point.y}
                width={barWidth}
                height={Math.max(2, HEIGHT - PAD_Y - point.y)}
                rx={Math.min(5, barWidth / 2)}
                fill={primary.color}
                opacity={index === safeIndex ? 1 : 0.48}
              />
            );
          })
        )}

        <line
          className={styles.chartGuide}
          x1={activeX}
          x2={activeX}
          y1={PAD_Y}
          y2={HEIGHT - PAD_Y}
        />
        <circle
          cx={activeX}
          cy={activePoint?.y ?? HEIGHT - PAD_Y}
          r="6"
          fill={primary.color}
          stroke="var(--pj-surface-raised, #fff)"
          strokeWidth="3"
        />
      </svg>

      {activePoint ? (
        <div
          className={styles.chartTooltip}
          style={{ left: `${(activeX / WIDTH) * 100}%` }}
          role="status"
          aria-live="polite"
        >
          <span>{dateFormatter(activePoint.date)}</span>
          {chart.map((item) => {
            const point = item.points[Math.min(safeIndex, item.points.length - 1)];
            return point ? (
              <strong key={item.name}>
                <i style={{ backgroundColor: item.color }} />
                {chart.length > 1 ? `${item.name}: ` : ""}
                {valueFormatter(point.value)}
              </strong>
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
