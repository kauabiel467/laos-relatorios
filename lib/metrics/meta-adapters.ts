import type { MetricValues, PrimaryKpiId } from "./catalog";
import { metaMetrics, metricChange, type MetaMetricRow } from "./engine";

export type MetaProjectionRow = MetaMetricRow & {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
};

export interface MetaProjectionInput {
  current?: MetaProjectionRow;
  previous?: MetaProjectionRow;
  daily: MetaProjectionRow[];
  campaigns: MetaProjectionRow[];
}

export interface MetaAdapterOutput {
  primaryMetricId: PrimaryKpiId;
  current: MetricValues;
  previous: MetricValues;
  delta: number | null;
  series: Array<{ date: string; metricId: PrimaryKpiId; value: number | null; metrics: MetricValues }>;
  campaigns: Array<{ id: string; name: string; objective: string; metricId: PrimaryKpiId; value: number | null; metrics: MetricValues }>;
  objectiveDistribution: Array<{ label: string; metricId: "spend"; value: number; percentage: number }>;
}

function distribution(campaigns: MetaAdapterOutput["campaigns"]) {
  const grouped = new Map<string, number>();
  for (const campaign of campaigns)
    grouped.set(campaign.objective, (grouped.get(campaign.objective) ?? 0) + (campaign.metrics.spend ?? 0));
  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0);
  return [...grouped.entries()]
    .map(([label, value]) => ({ label, metricId: "spend" as const, value, percentage: total ? value / total * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

// Adapter used by the project/dashboard engine.
export function adaptModernMeta(input: MetaProjectionInput, primaryMetricId: PrimaryKpiId): MetaAdapterOutput {
  const current = metaMetrics(input.current);
  const previous = metaMetrics(input.previous);
  const series = input.daily.map((row) => {
    const metrics = metaMetrics(row);
    return { date: String(row.date_start ?? ""), metricId: primaryMetricId, value: metrics[primaryMetricId], metrics };
  });
  const campaigns = input.campaigns.map((row) => {
    const metrics = metaMetrics(row);
    return { id: String(row.campaign_id ?? ""), name: String(row.campaign_name ?? row.campaign_id ?? ""), objective: String(row.objective ?? "Sem objetivo"), metricId: primaryMetricId, value: metrics[primaryMetricId], metrics };
  });
  return { primaryMetricId, current, previous, delta: metricChange(current[primaryMetricId], previous[primaryMetricId]), series, campaigns, objectiveDistribution: distribution(campaigns) };
}

// Adapter used by the legacy traffic dashboard. It deliberately assembles its
// output independently, while consuming the same canonical metric engine.
export function adaptLegacyMeta(input: MetaProjectionInput, primaryMetricId: PrimaryKpiId): MetaAdapterOutput {
  const current = metaMetrics(input.current);
  const previous = metaMetrics(input.previous);
  const series: MetaAdapterOutput["series"] = [];
  for (const row of input.daily) {
    const metrics = metaMetrics(row);
    series.push({ date: String(row.date_start ?? ""), metricId: primaryMetricId, value: metrics[primaryMetricId], metrics });
  }
  const campaigns: MetaAdapterOutput["campaigns"] = [];
  for (const row of input.campaigns) {
    const metrics = metaMetrics(row);
    campaigns.push({ id: String(row.campaign_id ?? ""), name: String(row.campaign_name ?? row.campaign_id ?? ""), objective: String(row.objective ?? "Sem objetivo"), metricId: primaryMetricId, value: metrics[primaryMetricId], metrics });
  }
  return { primaryMetricId, current, previous, delta: metricChange(current[primaryMetricId], previous[primaryMetricId]), series, campaigns, objectiveDistribution: distribution(campaigns) };
}
