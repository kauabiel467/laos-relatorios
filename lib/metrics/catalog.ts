export const METRIC_IDS = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "link_clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "purchases",
  "revenue",
  "roas",
  "cpa",
  "messages",
  "cost_message",
  "leads",
  "cpl",
  "landing_views",
  "checkouts",
  "profile_visits",
  "followers",
  "engagements",
] as const;

export type MetricId = (typeof METRIC_IDS)[number];
export type MetricUnit = "currency" | "count" | "percent" | "ratio";
export type MetricFormat = "money" | "number" | "percent" | "ratio";
export type MetricDirection = "increase" | "decrease" | "neutral";
export type MetricAggregation = "sum" | "account_unique" | "derived";
export type MetricDimension =
  | "money"
  | "impression"
  | "person"
  | "click"
  | "purchase"
  | "message"
  | "lead"
  | "page_view"
  | "checkout"
  | "profile_visit"
  | "follower"
  | "engagement"
  | "rate";

export interface MetricDefinition {
  id: MetricId;
  label: string;
  description: string;
  unit: MetricUnit;
  format: MetricFormat;
  favorableDirection: MetricDirection;
  origin: string;
  formula: string;
  aggregation: MetricAggregation;
  dimension: MetricDimension;
}

const meta = "Meta Ads Insights API";

export const METRICS: Record<MetricId, MetricDefinition> = {
  spend: {
    id: "spend", label: "Valor investido", description: "Investimento registrado pela Meta no período.",
    unit: "currency", format: "money", favorableDirection: "neutral", origin: meta,
    formula: "spend", aggregation: "sum", dimension: "money",
  },
  impressions: {
    id: "impressions", label: "Impressões", description: "Quantidade de exibições dos anúncios.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "impressions", aggregation: "sum", dimension: "impression",
  },
  reach: {
    id: "reach", label: "Alcance", description: "Pessoas únicas alcançadas no nível da conta. Não é somado entre campanhas, dias ou segmentos.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "reach", aggregation: "account_unique", dimension: "person",
  },
  clicks: {
    id: "clicks", label: "Cliques totais", description: "Todos os cliques nos anúncios.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "clicks", aggregation: "sum", dimension: "click",
  },
  link_clicks: {
    id: "link_clicks", label: "Cliques no link", description: "Cliques classificados pela taxonomia LAOS como clique no link.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[link_click]", aggregation: "sum", dimension: "click",
  },
  ctr: {
    id: "ctr", label: "CTR de link", description: "Cliques no link divididos pelas impressões.",
    unit: "percent", format: "percent", favorableDirection: "increase", origin: "Calculada a partir da Meta",
    formula: "link_clicks / impressions × 100", aggregation: "derived", dimension: "rate",
  },
  cpc: {
    id: "cpc", label: "Custo por clique no link", description: "Investimento dividido pelos cliques no link.",
    unit: "currency", format: "money", favorableDirection: "decrease", origin: "Calculada a partir da Meta",
    formula: "spend / link_clicks", aggregation: "derived", dimension: "money",
  },
  cpm: {
    id: "cpm", label: "CPM", description: "Investimento por mil impressões.",
    unit: "currency", format: "money", favorableDirection: "decrease", origin: "Calculada a partir da Meta",
    formula: "spend / impressions × 1.000", aggregation: "derived", dimension: "money",
  },
  frequency: {
    id: "frequency", label: "Frequência", description: "Impressões divididas pelo alcance único da conta.",
    unit: "ratio", format: "ratio", favorableDirection: "neutral", origin: "Calculada a partir da Meta",
    formula: "impressions / reach", aggregation: "derived", dimension: "rate",
  },
  purchases: {
    id: "purchases", label: "Compras no site", description: "Compras atribuídas pela Meta conforme a taxonomia central LAOS.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[purchase]", aggregation: "sum", dimension: "purchase",
  },
  revenue: {
    id: "revenue", label: "Receita atribuída", description: "Valor de compras atribuído pela Meta; não representa a receita total do negócio.",
    unit: "currency", format: "money", favorableDirection: "increase", origin: meta,
    formula: "action_values[purchase]", aggregation: "sum", dimension: "money",
  },
  roas: {
    id: "roas", label: "ROAS de compras", description: "Receita atribuída dividida pelo investimento.",
    unit: "ratio", format: "ratio", favorableDirection: "increase", origin: "Calculada a partir da Meta",
    formula: "revenue / spend", aggregation: "derived", dimension: "rate",
  },
  cpa: {
    id: "cpa", label: "Custo por compra", description: "Investimento dividido pelas compras atribuídas.",
    unit: "currency", format: "money", favorableDirection: "decrease", origin: "Calculada a partir da Meta",
    formula: "spend / purchases", aggregation: "derived", dimension: "money",
  },
  messages: {
    id: "messages", label: "Conversas iniciadas", description: "Conversas iniciadas conforme a taxonomia central LAOS.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[messaging_conversation_started]", aggregation: "sum", dimension: "message",
  },
  cost_message: {
    id: "cost_message", label: "Custo por conversa", description: "Investimento dividido pelas conversas iniciadas.",
    unit: "currency", format: "money", favorableDirection: "decrease", origin: "Calculada a partir da Meta",
    formula: "spend / messages", aggregation: "derived", dimension: "money",
  },
  leads: {
    id: "leads", label: "Leads", description: "Leads atribuídos conforme a taxonomia central LAOS, sem duplicar aliases equivalentes.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[lead]", aggregation: "sum", dimension: "lead",
  },
  cpl: {
    id: "cpl", label: "Custo por lead", description: "Investimento dividido pelos leads.",
    unit: "currency", format: "money", favorableDirection: "decrease", origin: "Calculada a partir da Meta",
    formula: "spend / leads", aggregation: "derived", dimension: "money",
  },
  landing_views: {
    id: "landing_views", label: "Visualizações de página", description: "Visualizações da página de destino reportadas pela Meta.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[landing_page_view]", aggregation: "sum", dimension: "page_view",
  },
  checkouts: {
    id: "checkouts", label: "Checkouts iniciados", description: "Inícios de checkout conforme a taxonomia central LAOS.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[initiate_checkout]", aggregation: "sum", dimension: "checkout",
  },
  profile_visits: {
    id: "profile_visits", label: "Visitas ao perfil", description: "Visitas ao perfil atribuídas pela Meta.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[profile_visit]", aggregation: "sum", dimension: "profile_visit",
  },
  followers: {
    id: "followers", label: "Seguidores", description: "Novos seguidores ou curtidas de página retornados pela Meta.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[follow]", aggregation: "sum", dimension: "follower",
  },
  engagements: {
    id: "engagements", label: "Engajamentos", description: "Engajamentos com a publicação retornados pela Meta.",
    unit: "count", format: "number", favorableDirection: "increase", origin: meta,
    formula: "actions[post_engagement]", aggregation: "sum", dimension: "engagement",
  },
};

export const PRIMARY_KPI_IDS = [
  "purchases", "leads", "messages", "link_clicks", "clicks", "landing_views", "profile_visits", "engagements",
] as const satisfies readonly MetricId[];

export type PrimaryKpiId = (typeof PRIMARY_KPI_IDS)[number];
export type MetricValues = Record<MetricId, number | null>;

export interface PrimaryCostDefinition {
  label: string;
  shortLabel: string;
  formula: string;
}

export function primaryCostDefinition(metricId: PrimaryKpiId): PrimaryCostDefinition {
  const labels: Record<PrimaryKpiId, [string, string]> = {
    purchases: ["Custo por compra", "CPA"],
    leads: ["Custo por lead", "CPL"],
    messages: ["Custo por conversa", "Custo/conversa"],
    link_clicks: ["Custo por clique no link", "CPC"],
    clicks: ["Custo por clique", "CPC"],
    landing_views: ["Custo por visita à página", "Custo/visita"],
    profile_visits: ["Custo por visita ao perfil", "Custo/visita"],
    engagements: ["Custo por engajamento", "Custo/engajamento"],
  };
  const [label, shortLabel] = labels[metricId];
  return { label, shortLabel, formula: `spend / ${metricId}` };
}

export function isMetricId(value: unknown): value is MetricId {
  return typeof value === "string" && value in METRICS;
}

export function isPrimaryKpiId(value: unknown): value is PrimaryKpiId {
  return typeof value === "string" && (PRIMARY_KPI_IDS as readonly string[]).includes(value);
}
