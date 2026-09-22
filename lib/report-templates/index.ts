import { METRICS, type MetricId, type MetricValues, type PrimaryKpiId } from "@/lib/metrics/catalog";
import { metricChange } from "@/lib/metrics/engine";
import { formatMetric } from "@/lib/projects/model";

export type ReportMessageTemplateId = "sales" | "messages" | "followers" | "overview";

export interface ReportMessageInput {
  client: string;
  since: string;
  until: string;
  compareSince?: string;
  compareUntil?: string;
  currency: string;
  primaryMetric: PrimaryKpiId;
  metrics: MetricId[];
  current: MetricValues;
  previous: MetricValues | null;
}

export interface ReportMessageTemplate {
  id: ReportMessageTemplateId;
  label: string;
  description: string;
  metrics: MetricId[];
  build: (input: ReportMessageInput) => string;
}

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });

const comparisonText = (input: ReportMessageInput, metric: MetricId) => {
  const previous = input.previous?.[metric];
  const current = input.current[metric];
  if (input.previous == null) return "sem comparação";
  const change = metricChange(current, previous);
  if (change == null) return "sem base comparável";
  if (change === 0) return "sem variação";
  return `${change > 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}% vs. período anterior`;
};

const metricLine = (input: ReportMessageInput, metric: MetricId) =>
  `• ${METRICS[metric].label}: ${formatMetric(metric, input.current[metric], input.currency)} (${comparisonText(input, metric)})`;

const buildMessage = (
  title: string,
  templateMetrics: MetricId[],
  input: ReportMessageInput,
) => {
  const visibleMetrics = templateMetrics.filter((metric) => input.metrics.includes(metric));
  const metrics = visibleMetrics.length ? visibleMetrics : [input.primaryMetric, "spend" as MetricId];
  const uniqueMetrics = [...new Set(metrics)];
  const comparison = input.compareSince && input.compareUntil
    ? `Comparação: ${formatDate(input.compareSince)} a ${formatDate(input.compareUntil)}`
    : "Comparação: desativada";
  return [
    `${title} — ${input.client}`,
    `Período: ${formatDate(input.since)} a ${formatDate(input.until)}`,
    comparison,
    "",
    ...uniqueMetrics.map((metric) => metricLine(input, metric)),
    "",
    "Fonte: Meta Ads · Relatório LAOS",
  ].join("\n");
};

export const REPORT_MESSAGE_TEMPLATES: ReportMessageTemplate[] = [
  {
    id: "sales",
    label: "Campanha de vendas",
    description: "Compras, receita, retorno e custo por compra.",
    metrics: ["purchases", "revenue", "roas", "cpa", "spend"],
    build: (input) => buildMessage("Resultado de vendas", ["purchases", "revenue", "roas", "cpa", "spend"], input),
  },
  {
    id: "messages",
    label: "Campanha de mensagens",
    description: "Conversas iniciadas, custo por conversa e investimento.",
    metrics: ["messages", "cost_message", "spend", "link_clicks"],
    build: (input) => buildMessage("Resultado de mensagens", ["messages", "cost_message", "spend", "link_clicks"], input),
  },
  {
    id: "followers",
    label: "Campanha de seguidores",
    description: "Seguidores, visitas ao perfil e engajamentos.",
    metrics: ["followers", "profile_visits", "engagements", "spend"],
    build: (input) => buildMessage("Resultado de seguidores", ["followers", "profile_visits", "engagements", "spend"], input),
  },
  {
    id: "overview",
    label: "Resumo do relatório",
    description: "KPI principal e indicadores selecionados no documento.",
    metrics: [],
    build: (input) => buildMessage("Resumo de resultados", [input.primaryMetric, "spend", "reach", "impressions"], input),
  },
];

export function reportTemplateAvailable(template: ReportMessageTemplate, input: ReportMessageInput) {
  if (template.id === "overview") return true;
  return template.metrics.some((metric) => input.metrics.includes(metric) && input.current[metric] != null);
}

export function buildReportMessage(templateId: ReportMessageTemplateId, input: ReportMessageInput) {
  const template = REPORT_MESSAGE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error("Modelo de relatório inválido.");
  return template.build(input);
}
