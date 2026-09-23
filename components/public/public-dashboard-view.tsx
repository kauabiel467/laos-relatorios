/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import {
  METRICS,
  customMetricValue,
  formatCustomMetric,
  formatMetric,
  metricChange,
  type AnalysisConfig,
  type AnalysisData,
  type MetricKey,
  type MetricValues,
} from "@/lib/projects/model";
import type { MetricUnit } from "@/lib/metrics/catalog";
import { shortDate } from "@/components/projects/ui";
import ProgressMetricCard, {
  type CardSize,
  type MetricAccent,
  type SeriesPoint,
} from "@/components/ui/progress-metric-card";
import "@/components/projects/projects.css";

type PublicDashboard = {
  title: string;
  config: AnalysisConfig;
  data: AnalysisData;
  updated_at: string;
  client_name: string;
  client_logo_url: string | null;
};

const metricUnitLabel = (unit: MetricUnit | undefined, currency: string) => {
  if (unit === "currency") return currency;
  if (unit === "percent") return "percentual";
  if (unit === "ratio") return "índice";
  return "contagem";
};

const safeRatio = (numerator: number | null, denominator: number | null, multiplier = 1) =>
  numerator != null && denominator != null && denominator !== 0
    ? (numerator / denominator) * multiplier
    : null;

// Mirrors analysis-view.tsx's per-metric campaign aggregation so a metric
// filtered by campaign shows the same number here as it does in the staff
// preview - the public page must never disagree with what was approved.
function aggregateCampaignMetrics(campaigns: Array<{ metrics: MetricValues }>): MetricValues {
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
  values.reach = null;
  values.frequency = null;
  return values;
}

const formatUpdatedAt = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PublicDashboardView({ token }: { token: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; dashboard: PublicDashboard }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/dashboards/${token}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((dashboard: PublicDashboard) => {
        if (!cancelled) setState({ status: "ready", dashboard });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="projects theme-light">
        <div className="pj-public-page" role="status" aria-live="polite" aria-label="Carregando relatório">
          <div className="pj-skeleton-card" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="projects theme-light">
        <div className="pj-public-page pj-public-error">
          <strong>Este link não está mais disponível.</strong>
          <p>Verifique o endereço ou peça um novo link a quem compartilhou este relatório.</p>
        </div>
      </div>
    );
  }

  const { dashboard } = state;
  const { config, data, client_name: clientName, client_logo_url: logo } = dashboard;
  const currency = data.currency || "BRL";
  const metricOrder = config.metric_order?.length ? config.metric_order : config.metrics;
  const customMetrics = config.custom_metrics ?? [];

  return (
    <div className="projects theme-light">
      <div className="pj-public-page">
        <header className="pj-public-header">
          {logo ? (
            <img src={logo} alt={`Logo de ${clientName}`} />
          ) : (
            <span className="pj-project-avatar">{clientName.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <strong>{clientName}</strong>
            <h1>{dashboard.title}</h1>
            <span>Atualizado em {formatUpdatedAt(dashboard.updated_at)}</span>
          </div>
          <button type="button" className="pj-button" onClick={() => window.print()}>
            Salvar PDF / imprimir
          </button>
        </header>
        <div className="pj-metric-grid">
          {metricOrder.map((id) => {
            const custom = customMetrics.find((metric) => metric.id === id);
            const builtIn = id in METRICS ? (id as MetricKey) : config.metric_aliases?.[id] ?? null;
            if (!custom && !builtIn) return null;
            const definition = builtIn ? METRICS[builtIn] : custom!;
            const campaignIds = config.metric_campaign_filters?.[id] ?? [];
            const filteredValues = campaignIds.length
              ? aggregateCampaignMetrics(data.campaigns.filter((campaign) => campaignIds.includes(campaign.id)))
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
            const showChart = config.metric_charts?.[id] !== false;
            const formatted = builtIn
              ? formatMetric(builtIn, value, currency)
              : formatCustomMetric(custom!, value, currency);
            const formattedPrevious = builtIn
              ? formatMetric(builtIn, previous, currency)
              : formatCustomMetric(custom!, previous, currency);
            const seriesData: SeriesPoint[] = campaignIds.length
              ? []
              : data.daily.flatMap((day) => {
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
                key={id}
                className={`pj-progress-metric-item size-${size} ${id === config.primary_metric ? "is-primary" : ""}`}
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
                  showChart={showChart}
                  featured={id === config.primary_metric}
                  highlighted={(config.featured_metrics ?? []).includes(id)}
                  goal={config.metric_goals?.[id] && value != null ? (() => {
                    const goal = config.metric_goals![id];
                    const progress = goal.value > 0 ? (value / goal.value) * 100 : 0;
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
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
