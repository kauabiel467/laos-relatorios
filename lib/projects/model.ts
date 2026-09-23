import {
  METRICS,
  PRIMARY_KPI_IDS,
  isPrimaryKpiId,
  type MetricFormat,
  type MetricId,
  type MetricUnit,
  type MetricValues,
  type PrimaryKpiId,
} from "@/lib/metrics/catalog";
import { calculatedMetricValue, metricChange } from "@/lib/metrics/engine";
import {
  lastMonthDateRange,
  currentMonthDateRange,
  previousCalendarMonth,
  previousDateRange,
  rollingDateRange,
} from "@/lib/metrics/dates";

export { METRICS, metricChange };
export type MetricKey = MetricId;
export type { MetricValues };
export type SectionKey =
  | "metrics"
  | "daily"
  | "results"
  | "funnel"
  | "campaigns"
  | "adsets"
  | "ads"
  | "platforms"
  | "audience"
  | "analysis";
export type MetricSize = "compact" | "wide" | "full";
export type MetricGoalCadence = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
export interface MetricGoal {
  type: "target" | "limit";
  value: number;
  cadence: MetricGoalCadence;
  autoRenew: boolean;
}
export type CustomMetricFormat = MetricFormat;
export interface CustomMetricDefinition {
  id: string;
  kind: "manual" | "calculated";
  label: string;
  description: string;
  format: CustomMetricFormat;
  lower?: boolean;
  value?: number;
  left?: MetricKey;
  right?: MetricKey;
  operation?: "add" | "subtract" | "divide" | "percentage";
  unit?: MetricUnit;
  origin?: "manual" | "calculated";
  aggregation?: "manual" | "derived";
  formula?: string;
}
export interface AnalysisConfig {
  preset: "last_7d" | "last_30d" | "last_90d" | "last_180d" | "current_month" | "last_month" | "custom";
  since: string;
  until: string;
  comparison: "previous" | "none" | "custom";
  compare_since?: string;
  compare_until?: string;
  campaign_ids: string[];
  metrics: MetricKey[];
  sections: SectionKey[];
  subtitle: string;
  analysis: string;
  template: string;
  primary_metric: PrimaryKpiId;
  custom_metrics?: CustomMetricDefinition[];
  metric_order?: string[];
  metric_sizes?: Record<string, MetricSize>;
  metric_charts?: Record<string, boolean>;
  metric_aliases?: Record<string, MetricKey>;
  featured_metrics?: string[];
  metric_goals?: Record<string, MetricGoal>;
  metric_campaign_filters?: Record<string, string[]>;
  chart_metric?: MetricKey;
  funnel_metrics?: MetricKey[];
}
export const SECTIONS: Record<SectionKey, string> = {
  metrics: "Indicadores principais",
  daily: "Evolução diária",
  results: "Evolução de resultados",
  funnel: "Funil de resultados",
  campaigns: "Campanhas em destaque",
  adsets: "Conjuntos de anúncios",
  ads: "Criativos e anúncios",
  platforms: "Facebook e Instagram",
  audience: "Público por idade e gênero",
  analysis: "Análise e próximos passos",
};
export const TEMPLATES: {
  id: string;
  name: string;
  description: string;
  icon: string;
  metrics: MetricKey[];
  sections: SectionKey[];
  primaryMetric: PrimaryKpiId;
}[] = [
  {
    id: "sales",
    name: "Vendas e delivery",
    description: "Compras, receita atribuída e retorno sobre o investimento.",
    icon: "↗",
    primaryMetric: "purchases",
    metrics: [
      "spend",
      "purchases",
      "revenue",
      "roas",
      "cpa",
      "link_clicks",
      "ctr",
      "cpm",
    ],
    sections: [
      "metrics",
      "daily",
      "results",
      "funnel",
      "campaigns",
      "adsets",
      "ads",
      "analysis",
    ],
  },
  {
    id: "messages",
    name: "Mensagens",
    description: "Conversas iniciadas e custo para gerar oportunidades.",
    icon: "◎",
    primaryMetric: "messages",
    metrics: [
      "spend",
      "messages",
      "cost_message",
      "reach",
      "impressions",
      "link_clicks",
      "ctr",
      "cpm",
    ],
    sections: [
      "metrics",
      "daily",
      "results",
      "campaigns",
      "adsets",
      "ads",
      "analysis",
    ],
  },
  {
    id: "leads",
    name: "Geração de leads",
    description: "Cadastros e eficiência na aquisição de contatos.",
    icon: "⊕",
    primaryMetric: "leads",
    metrics: [
      "spend",
      "leads",
      "cpl",
      "reach",
      "impressions",
      "link_clicks",
      "ctr",
      "cpc",
    ],
    sections: [
      "metrics",
      "daily",
      "results",
      "campaigns",
      "adsets",
      "ads",
      "analysis",
    ],
  },
  {
    id: "custom",
    name: "Personalizado",
    description: "Combine indicadores de vendas, mensagens e leads.",
    icon: "▦",
    primaryMetric: "purchases",
    metrics: [
      "spend",
      "purchases",
      "messages",
      "leads",
      "revenue",
      "roas",
      "cpa",
      "cost_message",
    ],
    sections: ["metrics", "daily", "results", "campaigns", "analysis"],
  },
];
export interface InsightItem {
  id: string;
  name: string;
  metrics: MetricValues;
  thumbnail?: string;
}
export interface AnalysisData {
  current: MetricValues;
  previous: MetricValues | null;
  daily: { date: string; metrics: MetricValues }[];
  campaigns: InsightItem[];
  adsets: InsightItem[];
  ads: InsightItem[];
  platforms: InsightItem[];
  audience: InsightItem[];
  warnings: string[];
  currency: string;
  timezone: string;
  primary_metric?: PrimaryKpiId;
  effective_period?: {
    since: string;
    until: string;
    compare_since?: string;
    compare_until?: string;
  };
  updated_at: string;
}
export interface ProjectDocument {
  id: string;
  client_id: string;
  kind: "dashboard" | "report" | "template";
  title: string;
  config: AnalysisConfig;
  data: AnalysisData | null;
  status: "draft" | "published";
  share_token: string | null;
  created_at: string;
  updated_at: string;
}
export function periodDates(
  preset: AnalysisConfig["preset"],
  today = new Date(),
  timezone = "UTC",
) {
  if (preset === "last_month") return lastMonthDateRange(timezone, today);
  if (preset === "current_month") return currentMonthDateRange(timezone, today);
  return rollingDateRange(
    preset === "last_7d" ? 7 : preset === "last_90d" ? 90 : preset === "last_180d" ? 180 : 30,
    timezone,
    today,
  );
}
export function previousDates(since: string, until: string) {
  const previous = previousDateRange(since, until);
  return { compare_since: previous.since, compare_until: previous.until };
}
export function defaultConfig(template = "sales"): AnalysisConfig {
  const t = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];
  return {
    preset: "last_month",
    ...periodDates("last_month"),
    comparison: "previous",
    campaign_ids: [],
    metrics: [...t.metrics],
    sections: [...t.sections],
    subtitle: "Análise de desempenho",
    analysis: "",
    template: t.id,
    primary_metric: t.primaryMetric,
    custom_metrics: [],
    metric_order: [...t.metrics],
    metric_sizes: {},
    metric_charts: {},
    metric_aliases: {},
    featured_metrics: [],
    metric_goals: {},
    metric_campaign_filters: {},
    chart_metric: t.primaryMetric,
  };
}

export function normalizeAnalysisConfig(
  value: AnalysisConfig | (Partial<AnalysisConfig> & Record<string, unknown>),
): AnalysisConfig {
  const template = TEMPLATES.find((item) => item.id === value.template);
  const configured = template?.primaryMetric;
  const available = value.metrics ?? [];
  const primary = isPrimaryKpiId(value.primary_metric) && available.includes(value.primary_metric)
    ? value.primary_metric
    : configured && available.includes(configured)
      ? configured
      : PRIMARY_KPI_IDS.find((id) => available.includes(id)) ?? "purchases";
  const customIds = (value.custom_metrics ?? []).map((metric) => metric.id);
  const aliasIds = Object.keys(value.metric_aliases ?? {});
  const allowedMetricIds = new Set([...available, ...customIds, ...aliasIds]);
  return {
    ...value,
    primary_metric: primary,
    featured_metrics: (value.featured_metrics ?? []).filter((id) => allowedMetricIds.has(id)),
    metric_charts: Object.fromEntries(
      Object.entries(value.metric_charts ?? {}).filter(([id]) => allowedMetricIds.has(id)),
    ),
    metric_goals: Object.fromEntries(
      Object.entries(value.metric_goals ?? {}).filter(([id]) => allowedMetricIds.has(id)),
    ),
    metric_campaign_filters: Object.fromEntries(
      Object.entries(value.metric_campaign_filters ?? {}).filter(([id]) => allowedMetricIds.has(id)),
    ),
  } as AnalysisConfig;
}
export function formatMetric(
  key: MetricKey,
  value: number | null | undefined,
  currency = "BRL",
) {
  if (value == null || !Number.isFinite(value)) return "—";
  const m = METRICS[key];
  return (
    new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: m.format === "number" ? 0 : 2,
      ...(m.format === "money" ? { style: "currency", currency } : {}),
    }).format(value) +
    (m.format === "percent" ? "%" : m.format === "ratio" ? "×" : "")
  );
}
export function customMetricValue(
  metric: CustomMetricDefinition,
  values: MetricValues | null | undefined,
) {
  if (metric.kind === "manual") return metric.value ?? null;
  if (!metric.left || !metric.right || !metric.operation) return null;
  return calculatedMetricValue(values, metric.left, metric.right, metric.operation);
}

export function formatCustomMetric(
  metric: CustomMetricDefinition,
  value: number | null | undefined,
  currency = "BRL",
) {
  if (value == null || !Number.isFinite(value)) return "—";
  return (
    new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: metric.format === "number" ? 0 : 2,
      ...(metric.format === "money" ? { style: "currency", currency } : {}),
    }).format(value) +
    (metric.format === "percent"
      ? "%"
      : metric.format === "ratio"
        ? "×"
        : "")
  );
}

export function comparisonDates(config: Pick<AnalysisConfig,'preset'|'since'|'until'>) {
 const previous = config.preset === "last_month"
   ? previousCalendarMonth(config.since)
   : previousDateRange(config.since, config.until);
 return { compare_since: previous.since, compare_until: previous.until };
}
