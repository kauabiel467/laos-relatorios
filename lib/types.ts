import type { MetricValues, PrimaryKpiId } from "@/lib/metrics/catalog";

export type AccountStatus = "ACTIVE" | "PAUSED";
export type PeriodKey = "last_7d" | "last_30d" | "last_90d" | "custom";
export type DashboardTab = "meta" | "cardapio";

export interface Client {
  id: string;
  name: string;
  status: AccountStatus;
  objective: "SALES" | "TRAFFIC" | "MESSAGES";
}

export interface DailyPoint {
  label: string;
  spend: number;
  result: number | null;
  metricId: PrimaryKpiId;
  revenue?: number;
}

export interface MediaMetricCard {
  label: string;
  value: number;
  delta: number | null;
  format: "compact" | "currency" | "percent";
  tone: "blue" | "green" | "orange" | "yellow" | "cyan" | "purple";
}

export interface ObjectiveDistributionItem {
  label: string;
  value: number;
  valueLabel: string;
  percentage: number;
  metricId: "spend";
}

export interface HourlyPerformancePoint {
  label: string;
  value: number | null;
  metricId: PrimaryKpiId;
  highlight: "base" | "medium" | "high";
}

export interface AgeAudiencePoint {
  label: string;
  value: number | null;
  metricId: PrimaryKpiId;
}

export interface GenderAudiencePoint {
  label: string;
  value: number | null;
  metricId: PrimaryKpiId;
  percentage: number;
}

export interface CampaignMetric {
  id: string;
  name: string;
  status: AccountStatus;
  objective: string;
  resultLabel: string;
  metricId: PrimaryKpiId;
  metrics: MetricValues;
  spend: number;
  reach: number | null;
  impressions?: number;
  clicks?: number;
  purchases?: number;
  followers?: number;
  ctr: number;
  roas: number;
  result: number | null;
}

export interface AdItem {
  id: string;
  name: string;
  type: "video" | "image" | "carousel";
  ctr: number;
  cpc: number;
  spend: number;
  impressions?: number;
  thumbnailUrl?: string;
  top?: boolean;
  lowPerformer?: boolean;
}

export interface QuickInsight {
  label: string;
  title: string;
  description: string;
  tone: "blue" | "orange" | "green";
}

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  tone: "high" | "warning" | "good" | "neutral";
}

export interface FunnelStep {
  label: string;
  value: number;
  color: "blue" | "indigo" | "purple" | "orange" | "yellow" | "green";
}

export interface CardapioMetrics {
  faturamento: number;
  pedidos: number;
  ticket: number;
  conversao: number;
}

export interface DashboardSnapshot {
  primaryMetricId: PrimaryKpiId;
  spend: number;
  spendDelta: number | null;
  resultLabel: string;
  resultValue: number | null;
  resultDelta: number | null;
  revenue: number;
  revenueDelta: number | null;
  roas: number;
  roasDelta: number | null;
  primaryCostLabel: string;
  primaryCost: number | null;
  primaryCostDelta: number | null;
  quickInsights: QuickInsight[];
  alerts: AlertItem[];
  healthScore: number;
  healthLabel: string;
  healthTone: "green" | "yellow" | "red";
  funnel: FunnelStep[];
  bottleneck: string;
  strength: string;
}

export interface DashboardDataBundle {
  primaryMetricId: PrimaryKpiId;
  timezone: string;
  currency: string;
  effectivePeriod: {
    since: string;
    until: string;
    compareSince: string;
    compareUntil: string;
  };
  snapshot: DashboardSnapshot;
  dailySeries: DailyPoint[];
  campaigns: CampaignMetric[];
  mediaMetrics: MediaMetricCard[];
  objectiveDistribution: ObjectiveDistributionItem[];
  hourlyPerformance: HourlyPerformancePoint[];
  ageAudience: AgeAudiencePoint[];
  genderAudience: GenderAudiencePoint[];
}

export interface MetaAdAccount {
  id: string;
  name: string;
  accountId: string;
  status: string;
  currency?: string;
  timezoneName?: string;
}

export type MetaIntegrationStage = "missing_config" | "disconnected" | "needs_selection" | "connected";

export interface MetaIntegrationStatus {
  stage: MetaIntegrationStage;
  connectedAt?: string;
  error?: string;
  accounts: MetaAdAccount[];
}
