import type { MetricId, MetricValues, PrimaryKpiId } from "@/lib/metrics/catalog";
import { METRIC_IDS } from "@/lib/metrics/catalog";
import {
  DETAILED_REPORT_LINK_PLACEHOLDER,
  buildRunMessage,
  planAutomationRun,
  type AutomationDefinition,
  type RunMessageResult,
} from "./engine";
import type { AutomationRow } from "./model";
import { nextRunAt, type AutomationSchedule } from "./schedule";
import type { AutomationPeriod } from "./periods";

// What a manager sees before saving: the message the next run WOULD send, the
// period and comparison it would cover, and when that run happens. It goes through
// the very same planAutomationRun/buildRunMessage as a real run, so the preview
// cannot drift from what is sent.

export interface PreviewSample {
  currency: string;
  current: MetricValues;
  previous: MetricValues | null;
  primary_metric: PrimaryKpiId;
  metrics: MetricId[];
  // True when the numbers are made up because the dashboard has no data yet.
  isExample?: boolean;
}

const nothing = () => Object.fromEntries(METRIC_IDS.map((id) => [id, null])) as MetricValues;

// Plausible round numbers, shown (and labelled as an example) only when the
// selected dashboard has no imported results to borrow real figures from.
export const EXAMPLE_PREVIEW_SAMPLE: PreviewSample = {
  currency: "BRL",
  isExample: true,
  primary_metric: "purchases",
  metrics: [...METRIC_IDS],
  current: {
    ...nothing(), spend: 600, reach: 9000, impressions: 24000, link_clicks: 820, purchases: 12, revenue: 2400,
    roas: 4, cpa: 50, messages: 60, cost_message: 10, leads: 30, cpl: 20, landing_views: 64, profile_visits: 300, followers: 25,
  },
  previous: {
    ...nothing(), spend: 540, reach: 8200, impressions: 21000, link_clicks: 700, purchases: 9, revenue: 1750,
    roas: 3.24, cpa: 60, messages: 45, cost_message: 12, leads: 24, cpl: 22.5, landing_views: 50, profile_visits: 260, followers: 20,
  },
};

// The little the preview needs from a dashboard (kept small on purpose: the API
// sends this, not the whole report).
export function previewSampleFromDocument(document: {
  config: { metrics?: MetricId[]; primary_metric?: PrimaryKpiId } | null;
  data: { currency?: string; current?: MetricValues; previous?: MetricValues | null } | null;
}): PreviewSample | null {
  if (!document.data?.current || !document.config?.metrics?.length || !document.config.primary_metric) return null;
  return {
    currency: document.data.currency || "BRL",
    current: document.data.current,
    previous: document.data.previous ?? null,
    primary_metric: document.config.primary_metric,
    metrics: document.config.metrics,
  };
}

export type PreviewForm = Pick<
  AutomationRow,
  | "message_template"
  | "period_preset"
  | "comparison_enabled"
  | "include_detailed_report"
  | "detailed_report_intro"
  | "timezone"
  | "run_weekday"
  | "run_time"
>;

export interface AutomationPreview {
  usedExample: boolean;
  nextRunAt: Date;
  period: AutomationPeriod;
  message: RunMessageResult;
}

export function buildAutomationPreview(args: {
  clientName: string;
  sample: PreviewSample | null;
  form: PreviewForm;
  now?: Date;
}): AutomationPreview {
  const now = args.now ?? new Date();
  const schedule: AutomationSchedule = { runWeekday: args.form.run_weekday, runTime: args.form.run_time, timezone: args.form.timezone };
  const runAt = nextRunAt(schedule, now);
  const definition: AutomationDefinition = { id: "preview", client_id: "", document_id: "", ...args.form };
  // The period is the one the NEXT run will compute, i.e. as of the moment it fires.
  const plan = planAutomationRun(definition, { now: runAt, scheduledFor: runAt });
  const sample = args.sample ?? EXAMPLE_PREVIEW_SAMPLE;
  const message = buildRunMessage(plan, {
    clientName: args.clientName,
    config: { primary_metric: sample.primary_metric, metrics: sample.metrics },
    data: { currency: sample.currency, current: sample.current, previous: sample.previous },
    detailedReportLink: DETAILED_REPORT_LINK_PLACEHOLDER,
  });
  return { usedExample: !args.sample || Boolean(args.sample.isExample), nextRunAt: runAt, period: plan.period, message };
}
