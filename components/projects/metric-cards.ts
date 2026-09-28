import {
  METRICS,
  customMetricValue,
  formatCustomMetric,
  formatMetric,
  metricChange,
  type AnalysisConfig,
  type AnalysisData,
  type CustomMetricDefinition,
  type MetricKey,
  type MetricSize,
  type MetricValues,
} from "@/lib/projects/model";
import type { MetricUnit } from "@/lib/metrics/catalog";
import type {
  MetricAccent,
  ProgressMetricCardProps,
  SeriesPoint,
} from "@/components/ui/progress-metric-card";
import { shortDate } from "./ui";

export const metricUnitLabel = (unit: MetricUnit | undefined, currency: string) => {
  if (unit === "currency") return currency;
  if (unit === "percent") return "percentual";
  if (unit === "ratio") return "índice";
  return "contagem";
};

const safeRatio = (numerator: number | null, denominator: number | null, multiplier = 1) =>
  numerator != null && denominator != null && denominator !== 0
    ? (numerator / denominator) * multiplier
    : null;

export function aggregateCampaignMetrics(campaigns: Array<{ metrics: MetricValues }>): MetricValues {
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

// Display order of the metric cards: the saved order first, then anything
// available that was never ordered explicitly.
export function resolveMetricOrder(config: AnalysisConfig) {
  const availableMetricIds = [
    ...config.metrics,
    ...(config.custom_metrics ?? []).map((metric) => metric.id),
    ...Object.keys(config.metric_aliases ?? {}),
  ];
  return [
    ...(config.metric_order ?? []).filter((id) => availableMetricIds.includes(id)),
    ...availableMetricIds.filter((id) => !(config.metric_order ?? []).includes(id)),
  ];
}

export type MetricCardModel = {
  id: string;
  savedSize: MetricSize;
  props: Pick<
    ProgressMetricCardProps,
    | "title"
    | "description"
    | "total"
    | "percent"
    | "trend"
    | "statusLabel"
    | "comparisonLabel"
    | "period"
    | "unitLabel"
    | "accent"
    | "data"
    | "showChart"
    | "featured"
    | "highlighted"
    | "goal"
    | "defaultIndex"
    | "dateFormatter"
    | "valueFormatter"
  >;
};

// Turns one configured metric into the props of a ProgressMetricCard. Shared by
// the editor and the client-facing report so the same number can never be
// computed two different ways.
export function deriveMetricCard(
  id: string,
  config: AnalysisConfig,
  data: AnalysisData,
  currency: string,
): MetricCardModel | null {
  const customMetrics: CustomMetricDefinition[] = config.custom_metrics ?? [];
  const custom = customMetrics.find((metric) => metric.id === id);
  const builtIn = id in METRICS ? (id as MetricKey) : (config.metric_aliases ?? {})[id] ?? null;
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
  const format = (input: number | null | undefined) =>
    builtIn ? formatMetric(builtIn, input, currency) : formatCustomMetric(custom!, input, currency);
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
  const effectiveSince = data.effective_period?.since ?? config.since;
  const effectiveUntil = data.effective_period?.until ?? config.until;
  const period = effectiveSince && effectiveUntil
    ? `${shortDate(effectiveSince)} – ${shortDate(effectiveUntil)}`
    : "Período atual";
  const comparisonLabel = !data.previous
    ? "Comparação desativada"
    : campaignIds.length
      ? `${campaignIds.length} campanha${campaignIds.length === 1 ? "" : "s"} neste indicador`
      : previous === 0 && value != null
        ? "O período anterior terminou em zero"
        : previous != null
          ? `${format(previous)} no período anterior`
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
  const goalConfig = config.metric_goals?.[id];
  return {
    id,
    savedSize: config.metric_sizes?.[id] ?? "compact",
    props: {
      title: definition.label,
      description: definition.description || "Métrica personalizada",
      total: format(value),
      percent: delta == null ? undefined : `${Math.abs(delta).toFixed(1).replace(".", ",")}%`,
      trend: delta == null || delta === 0 ? "flat" : delta > 0 ? "up" : "down",
      statusLabel,
      comparisonLabel,
      period,
      unitLabel: metricUnitLabel(definition.unit, currency),
      accent,
      data: seriesData,
      showChart: config.metric_charts?.[id] ?? config.metric_charts_default ?? true,
      featured: id === config.primary_metric,
      highlighted: (config.featured_metrics ?? []).includes(id),
      goal: goalConfig && value != null
        ? (() => {
            const progress = goalConfig.value > 0 ? (value / goalConfig.value) * 100 : 0;
            const reached = goalConfig.type === "target" ? value >= goalConfig.value : value <= goalConfig.value;
            return {
              label: goalConfig.type === "target" ? "Meta" : "Limite",
              valueLabel: format(goalConfig.value),
              progress,
              status: reached
                ? goalConfig.type === "target" ? "Meta atingida" : "Dentro do limite"
                : `${Math.min(Math.round(progress), 999)}% alcançado`,
            };
          })()
        : undefined,
      defaultIndex: Math.max(seriesData.length - 1, 0),
      dateFormatter: shortDate,
      valueFormatter: (pointValue: number) => format(pointValue),
    },
  };
}
