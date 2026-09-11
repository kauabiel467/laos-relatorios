import {
  METRIC_IDS,
  METRICS,
  type MetricFormat,
  type MetricId,
  type MetricValues,
  type PrimaryKpiId,
} from "./catalog";
import { readMetaEvent, type MetaAction } from "./meta-events";

export interface MetaMetricRow {
  [key: string]: unknown;
  spend?: string | number;
  impressions?: string | number;
  reach?: string | number;
  clicks?: string | number;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}
const number = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const divide = (left: number | null, right: number | null, scale = 1) =>
  left == null || right == null || right === 0 ? null : (left / right) * scale;

export function emptyMetricValues(): MetricValues {
  return Object.fromEntries(METRIC_IDS.map((id) => [id, null])) as MetricValues;
}

export function metaMetrics(row: MetaMetricRow | undefined): MetricValues {
  if (!row) return emptyMetricValues();
  const spend = number(row.spend);
  const impressions = number(row.impressions);
  const reach = number(row.reach);
  const clicks = number(row.clicks);
  const linkClicks = readMetaEvent(row.actions, "link_clicks");
  const purchases = readMetaEvent(row.actions, "purchases");
  const revenue = readMetaEvent(row.action_values, "revenue");
  const messages = readMetaEvent(row.actions, "messages");
  const leads = readMetaEvent(row.actions, "leads");
  return {
    spend,
    impressions,
    reach,
    clicks,
    link_clicks: linkClicks,
    ctr: divide(linkClicks, impressions, 100),
    cpc: divide(spend, linkClicks),
    cpm: divide(spend, impressions, 1000),
    frequency: divide(impressions, reach),
    purchases,
    revenue,
    roas: divide(revenue, spend),
    cpa: divide(spend, purchases),
    messages,
    cost_message: divide(spend, messages),
    leads,
    cpl: divide(spend, leads),
    landing_views: readMetaEvent(row.actions, "landing_views"),
    checkouts: readMetaEvent(row.actions, "checkouts"),
    profile_visits: readMetaEvent(row.actions, "profile_visits"),
    followers: readMetaEvent(row.actions, "followers"),
    engagements: readMetaEvent(row.actions, "engagements"),
  };
}

const additive = METRIC_IDS.filter((id) => METRICS[id].aggregation === "sum");

export function aggregateMetricValues(
  values: MetricValues[],
  scope: "account" | "campaign_collection" | "segment_collection",
): MetricValues {
  if (!values.length) return emptyMetricValues();
  const total = emptyMetricValues();
  for (const id of additive) {
    const available = values.map((item) => item[id]).filter((value): value is number => value != null);
    total[id] = available.length ? available.reduce((sum, value) => sum + value, 0) : null;
  }
  total.reach = scope === "account" && values.length === 1 ? values[0].reach : null;
  total.ctr = divide(total.link_clicks, total.impressions, 100);
  total.cpc = divide(total.spend, total.link_clicks);
  total.cpm = divide(total.spend, total.impressions, 1000);
  total.frequency = divide(total.impressions, total.reach);
  total.roas = divide(total.revenue, total.spend);
  total.cpa = divide(total.spend, total.purchases);
  total.cost_message = divide(total.spend, total.messages);
  total.cpl = divide(total.spend, total.leads);
  return total;
}

export function metricChange(
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  return current == null || previous == null || previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}

export function primaryMetricSnapshot(
  current: MetaMetricRow | undefined,
  previous: MetaMetricRow | undefined,
  metricId: PrimaryKpiId,
) {
  const currentMetrics = metaMetrics(current);
  const previousMetrics = metaMetrics(previous);
  const currentValue = currentMetrics[metricId];
  const previousValue = previousMetrics[metricId];
  return {
    metricId,
    definition: METRICS[metricId],
    currentValue,
    previousValue,
    delta: metricChange(currentValue, previousValue),
    comparable: currentValue != null && previousValue != null && previousValue !== 0,
  };
}

export function inferCalculationFormat(
  left: MetricId,
  right: MetricId,
  operation: "add" | "subtract" | "divide" | "percentage",
): { valid: true; format: MetricFormat } | { valid: false; reason: string } {
  const leftMetric = METRICS[left];
  const rightMetric = METRICS[right];
  if (operation === "add" || operation === "subtract") {
    if (leftMetric.dimension !== rightMetric.dimension || leftMetric.unit !== rightMetric.unit) {
      return { valid: false, reason: "Soma e subtração exigem métricas da mesma dimensão e unidade." };
    }
    return { valid: true, format: leftMetric.format };
  }
  if (operation === "percentage") {
    if (leftMetric.unit !== rightMetric.unit) {
      return { valid: false, reason: "Percentuais exigem numerador e denominador com a mesma unidade." };
    }
    return { valid: true, format: "percent" };
  }
  if (leftMetric.unit === "currency" && rightMetric.unit === "count") {
    return { valid: true, format: "money" };
  }
  return { valid: true, format: "ratio" };
}

export function calculatedMetricValue(
  values: MetricValues | null | undefined,
  left: MetricId,
  right: MetricId,
  operation: "add" | "subtract" | "divide" | "percentage",
) {
  if (!values) return null;
  const validation = inferCalculationFormat(left, right, operation);
  if (!validation.valid) return null;
  const leftValue = values[left];
  const rightValue = values[right];
  if (leftValue == null || rightValue == null) return null;
  if (operation === "add") return leftValue + rightValue;
  if (operation === "subtract") return leftValue - rightValue;
  return divide(leftValue, rightValue, operation === "percentage" ? 100 : 1);
}
