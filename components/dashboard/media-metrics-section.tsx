"use client";

import type { MediaMetricCard } from "@/lib/types";
import { formatCompact, formatCurrency, formatPercent } from "@/lib/utils/format";
import { MetricCard } from "./metric-card";
import { SectionTitle } from "./section-title";

interface MediaMetricsSectionProps {
  metrics: MediaMetricCard[];
  loading?: boolean;
}

function formatMetricValue(metric: MediaMetricCard) {
  if (metric.format === "currency") return formatCurrency(metric.value);
  if (metric.format === "percent") return formatPercent(metric.value);
  return formatCompact(metric.value);
}

function formatMetricDelta(metric: MediaMetricCard) {
  if (metric.delta === null || Number.isNaN(metric.delta)) {
    return "sem comparativo";
  }

  const sign = metric.delta > 0 ? "+" : "";
  return `${sign}${formatPercent(metric.delta)}`;
}

export function MediaMetricsSection({ metrics, loading }: MediaMetricsSectionProps) {
  return (
    <section>
      <SectionTitle>Metricas de Midia</SectionTitle>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={loading ? "Carregando..." : formatMetricValue(metric)}
            delta={loading ? "atualizando..." : formatMetricDelta(metric)}
            tone={metric.tone}
          />
        ))}
      </div>
    </section>
  );
}
