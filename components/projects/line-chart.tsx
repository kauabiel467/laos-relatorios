"use client";

import { useId, useState } from "react";
import {
  formatMetric,
  type AnalysisData,
  type MetricKey,
} from "@/lib/projects/model";
import { shortDate } from "./ui";

export function LineChart({
  daily,
  metric,
  currency,
  color = "#3b82f6",
}: {
  daily: AnalysisData["daily"];
  metric: MetricKey;
  currency: string;
  color?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const gradientId = "chart" + useId().replaceAll(":", "");
  const values = daily.map((day) => day.metrics[metric] ?? 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => ({
    x: 24 + (index * 852) / Math.max(values.length - 1, 1),
    y: 174 - (value / max) * 142,
    value,
  }));

  if (!values.length) return <p>Sem dados diários neste período.</p>;

  return (
    <div className="pj-chart" onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 900 200" role="img" aria-label="Gráfico diário">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[32, 79, 126, 174].map((y) => (
          <line key={y} x1="24" y1={y} x2="876" y2={y} />
        ))}
        <polygon
          points={`24,174 ${points.map((point) => `${point.x},${point.y}`).join(" ")} 876,174`}
          fill={`url(#${gradientId})`}
        />
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {active != null && (
          <line
            className="pj-chart-guide"
            x1={points[active].x}
            x2={points[active].x}
            y1="24"
            y2="174"
          />
        )}
        {points.map((point, index) => (
          <g key={daily[index].date}>
            <circle
              className={active === index ? "pj-chart-dot active" : "pj-chart-dot"}
              cx={point.x}
              cy={point.y}
              r={active === index ? 6 : 4}
              fill={color}
            />
            <circle
              className="pj-chart-hit"
              cx={point.x}
              cy={point.y}
              r="14"
              tabIndex={0}
              aria-label={`${shortDate(daily[index].date)}: ${formatMetric(metric, point.value, currency)}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            />
          </g>
        ))}
      </svg>
      {active != null && (
        <div
          className="pj-chart-tooltip"
          style={{ left: `${(points[active].x / 900) * 100}%` }}
          role="status"
        >
          <span>{shortDate(daily[active].date)}</span>
          <strong>{formatMetric(metric, points[active].value, currency)}</strong>
        </div>
      )}
      <div className="pj-chart-axis">
        <span>{shortDate(daily[0].date)}</span>
        <span>{shortDate(daily.at(-1)!.date)}</span>
      </div>
    </div>
  );
}
