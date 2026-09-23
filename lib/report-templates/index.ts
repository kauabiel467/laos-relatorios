import { METRICS, type MetricId, type MetricValues, type PrimaryKpiId } from "@/lib/metrics/catalog";

export type ReportMessageTemplateId = "sales" | "messages" | "followers" | "traffic" | "overview";

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

// dd/mm only, no year - distinct from the app's formatDate (which includes the
// year), because the copied WhatsApp message only ever covers a short recent
// period where the year is implied.
const shortDate = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });

const formatMoney = (value: number | null | undefined, currency: string) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatCount = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
};

const formatRatio = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}×`;
};

// Fields like "ticket médio" or "custo por visualização" aren't catalog
// metrics - they're computed here, locally, from two current-period values.
const divide = (numerator: number | null | undefined, denominator: number | null | undefined) => {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return numerator / denominator;
};

const buildHeader = (input: ReportMessageInput, title: string) => [
  `*${input.client}*`,
  "",
  "Segue o relatório do período:",
  `📆 (${shortDate(input.since)} a ${shortDate(input.until)})`,
  "",
  `*${title}:*`,
  "",
];

const buildMessage = (input: ReportMessageInput, title: string, lines: string[]) =>
  [...buildHeader(input, title), ...lines].join("\n");

export const REPORT_MESSAGE_TEMPLATES: ReportMessageTemplate[] = [
  {
    id: "sales",
    label: "Campanha de vendas",
    description: "Compras, receita, retorno e custo por compra.",
    metrics: ["purchases", "revenue", "roas", "cpa", "spend"],
    build: (input) => {
      const { current, currency } = input;
      return buildMessage(input, "CAMPANHA DE VENDAS", [
        `💰 Investimento total: ${formatMoney(current.spend, currency)}`,
        `📊 Alcance: ${formatCount(current.reach)} pessoas`,
        `🛒 Vendas: ${formatCount(current.purchases)}`,
        `🎟️ Ticket médio: ${formatMoney(divide(current.revenue, current.purchases), currency)}`,
        `💵 Custo por venda: ${formatMoney(current.cpa, currency)}`,
        `💳 Valor total em vendas: ${formatMoney(current.revenue, currency)}`,
        `🚀 ROAS: ${formatRatio(current.roas)}`,
      ]);
    },
  },
  {
    id: "messages",
    label: "Campanha de mensagens",
    description: "Conversas iniciadas, custo por conversa e investimento.",
    metrics: ["messages", "cost_message", "spend"],
    build: (input) => {
      const { current, currency } = input;
      return buildMessage(input, "CAMPANHA DE MENSAGENS", [
        `💰 Investimento total: ${formatMoney(current.spend, currency)}`,
        `📊 Alcance: ${formatCount(current.reach)} pessoas`,
        `💬 Número de mensagens: ${formatCount(current.messages)}`,
        `💵 Custo por mensagem: ${formatMoney(current.cost_message, currency)}`,
      ]);
    },
  },
  {
    id: "followers",
    label: "Campanha de seguidores",
    description: "Seguidores, visitas ao perfil e engajamentos.",
    metrics: ["followers", "profile_visits", "spend"],
    build: (input) => {
      const { current, currency } = input;
      return buildMessage(input, "CAMPANHA DE SEGUIDORES", [
        `💰 Investimento total: ${formatMoney(current.spend, currency)}`,
        `📊 Alcance: ${formatCount(current.reach)} pessoas`,
        `👤 Visitas ao perfil: ${formatCount(current.profile_visits)}`,
        `➕ Novos seguidores: ${formatCount(current.followers)}`,
        `💵 Custo por visita ao perfil: ${formatMoney(divide(current.spend, current.profile_visits), currency)}`,
        `💰 Custo por seguidor: ${formatMoney(divide(current.spend, current.followers), currency)}`,
      ]);
    },
  },
  {
    id: "traffic",
    label: "Campanha de tráfego",
    description: "Investimento, alcance e visualizações do cardápio digital.",
    // Deliberately just landing_views, not spend: spend exists on nearly every
    // project, so including it here would make the button read as "available"
    // even with zero cardápio data. (The other templates above do include
    // spend in their availability list; that's a pre-existing looseness, not
    // something to replicate for a brand-new template.)
    metrics: ["landing_views"],
    build: (input) => {
      const { current, currency } = input;
      return buildMessage(input, "CAMPANHA DE TRÁFEGO PARA CARDÁPIO", [
        `💰 Investimento total: ${formatMoney(current.spend, currency)}`,
        `📊 Alcance: ${formatCount(current.reach)} pessoas`,
        `📲 Visualizações no Cardápio: ${formatCount(current.landing_views)}`,
        `💵 Custo por visualização: ${formatMoney(divide(current.spend, current.landing_views), currency)}`,
      ]);
    },
  },
  {
    id: "overview",
    label: "Resumo do relatório",
    description: "KPI principal e indicadores selecionados no documento.",
    metrics: [],
    build: (input) => {
      const { current, currency, primaryMetric } = input;
      return buildMessage(input, "RESUMO DO RELATÓRIO", [
        `🎯 ${METRICS[primaryMetric].label}: ${formatCount(current[primaryMetric])}`,
        `💰 Investimento total: ${formatMoney(current.spend, currency)}`,
        `📊 Alcance: ${formatCount(current.reach)} pessoas`,
        `👁️ Impressões: ${formatCount(current.impressions)}`,
      ]);
    },
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
