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
  result: number;
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
}

export interface HourlyPerformancePoint {
  label: string;
  value: number;
  highlight: "base" | "medium" | "high";
}

export interface AgeAudiencePoint {
  label: string;
  value: number;
}

export interface GenderAudiencePoint {
  label: string;
  value: number;
  percentage: number;
}

export interface CampaignMetric {
  id: string;
  name: string;
  status: AccountStatus;
  objective: string;
  resultLabel: string;
  spend: number;
  reach: number;
  impressions?: number;
  clicks?: number;
  purchases?: number;
  followers?: number;
  ctr: number;
  roas: number;
  result: number;
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
  spend: number;
  spendDelta: number;
  resultLabel: string;
  resultValue: number;
  resultDelta: number;
  revenue: number;
  revenueDelta: number;
  roas: number;
  roasDelta: number;
  cpa: number;
  cpaDelta: number;
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
