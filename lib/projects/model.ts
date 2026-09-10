export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "link_clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "frequency"
  | "purchases"
  | "revenue"
  | "roas"
  | "cpa"
  | "messages"
  | "cost_message"
  | "leads"
  | "cpl"
  | "landing_views"
  | "checkouts";
export type SectionKey =
  | "metrics"
  | "daily"
  | "funnel"
  | "campaigns"
  | "adsets"
  | "ads"
  | "platforms"
  | "audience"
  | "analysis";
export interface AnalysisConfig {
  preset: "last_7d" | "last_30d" | "last_month" | "custom";
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
}
export interface MetricDefinition {
  label: string;
  format: "money" | "number" | "percent" | "ratio";
  lower?: boolean;
  description: string;
}
export const METRICS: Record<MetricKey, MetricDefinition> = {
  spend: {
    label: "Valor investido",
    format: "money",
    description: "Investimento registrado pela Meta no período.",
  },
  impressions: {
    label: "Impressões",
    format: "number",
    description: "Quantidade de exibições dos anúncios.",
  },
  reach: {
    label: "Alcance",
    format: "number",
    description:
      "Pessoas alcançadas, segundo a Meta. Não somar entre campanhas ou períodos.",
  },
  clicks: {
    label: "Cliques totais",
    format: "number",
    description: "Todos os cliques nos anúncios.",
  },
  link_clicks: {
    label: "Cliques no link",
    format: "number",
    description: "Cliques que a Meta classifica como link_click.",
  },
  ctr: {
    label: "CTR de link",
    format: "percent",
    description: "Cliques no link ÷ impressões × 100.",
  },
  cpc: {
    label: "Custo por clique no link",
    format: "money",
    lower: true,
    description: "Investimento ÷ cliques no link.",
  },
  cpm: {
    label: "CPM",
    format: "money",
    lower: true,
    description: "Investimento por mil impressões.",
  },
  frequency: {
    label: "Frequência",
    format: "ratio",
    description: "Impressões ÷ alcance.",
  },
  purchases: {
    label: "Compras no site",
    format: "number",
    description: "Compras atribuídas pela Meta ao pixel do site.",
  },
  revenue: {
    label: "Receita atribuída",
    format: "money",
    description:
      "Valor das compras no site atribuído pela Meta. Não representa a receita total do negócio.",
  },
  roas: {
    label: "ROAS de compras",
    format: "ratio",
    description: "Receita atribuída ÷ investimento.",
  },
  cpa: {
    label: "Custo por compra",
    format: "money",
    lower: true,
    description: "Investimento ÷ compras no site.",
  },
  messages: {
    label: "Conversas iniciadas",
    format: "number",
    description:
      "Conversas iniciadas em anúncios, conforme o evento retornado pela Meta.",
  },
  cost_message: {
    label: "Custo por conversa",
    format: "money",
    lower: true,
    description: "Investimento ÷ conversas iniciadas.",
  },
  leads: {
    label: "Leads",
    format: "number",
    description:
      "Cadastros atribuídos pela Meta, sem somar variantes do mesmo evento.",
  },
  cpl: {
    label: "Custo por lead",
    format: "money",
    lower: true,
    description: "Investimento ÷ leads.",
  },
  landing_views: {
    label: "Visualizações de página",
    format: "number",
    description: "Landing page views reportadas pela Meta.",
  },
  checkouts: {
    label: "Checkouts iniciados",
    format: "number",
    description: "Inícios de checkout no site reportados pela Meta.",
  },
};
export const SECTIONS: Record<SectionKey, string> = {
  metrics: "Indicadores principais",
  daily: "Evolução diária",
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
}[] = [
  {
    id: "sales",
    name: "Vendas e delivery",
    description: "Compras, receita atribuída e retorno sobre o investimento.",
    icon: "↗",
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
    sections: ["metrics", "daily", "campaigns", "adsets", "ads", "analysis"],
  },
  {
    id: "leads",
    name: "Geração de leads",
    description: "Cadastros e eficiência na aquisição de contatos.",
    icon: "⊕",
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
    sections: ["metrics", "daily", "campaigns", "adsets", "ads", "analysis"],
  },
  {
    id: "custom",
    name: "Personalizado",
    description: "Combine indicadores de vendas, mensagens e leads.",
    icon: "▦",
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
    sections: ["metrics", "daily", "campaigns", "analysis"],
  },
];
export type MetricValues = Record<MetricKey, number | null>;
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
  created_at: string;
  updated_at: string;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function periodDates(
  preset: AnalysisConfig["preset"],
  today = new Date(),
) {
  const end = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const start = new Date(end);
  if (preset === "last_month") {
    end.setUTCDate(0);
    start.setUTCMonth(start.getUTCMonth() - 1, 1);
  } else start.setUTCDate(start.getUTCDate() - (preset === "last_7d" ? 6 : 29));
  return { since: iso(start), until: iso(end) };
}
export function previousDates(since: string, until: string) {
  const start = new Date(since + "T00:00:00Z"),
    end = new Date(until + "T00:00:00Z");
  const length = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const previousEnd = new Date(start.getTime() - 86400000);
  return {
    compare_since: iso(
      new Date(previousEnd.getTime() - (length - 1) * 86400000),
    ),
    compare_until: iso(previousEnd),
  };
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
  };
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
export function metricChange(
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  return current == null || previous == null || previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}

export function comparisonDates(config: Pick<AnalysisConfig,'preset'|'since'|'until'>) {
 if(config.preset==='last_month') {const end=new Date(config.since+'T00:00:00Z');end.setUTCDate(0);const start=new Date(end);start.setUTCDate(1);return {compare_since:iso(start),compare_until:iso(end)};}
 return previousDates(config.since,config.until);
}
