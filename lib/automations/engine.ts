import { buildReportMessage, reportTemplateAvailable, REPORT_MESSAGE_TEMPLATES, type ReportMessageTemplateId } from "@/lib/report-templates";
import { reportMessageInputFromAnalysis } from "@/lib/report-templates/from-analysis";
import type { AnalysisConfig, AnalysisData } from "@/lib/projects/model";
import { dateInTimeZone } from "@/lib/metrics/dates";
import type { AutomationRunRow, AutomationRunStatus, AutomationRow } from "./model";
import { resolveAutomationPeriod, type AutomationPeriod } from "./periods";

// The pure core of the automation engine. Given an automation and "now" it
// decides WHAT a run covers and builds the words and the records; it performs no
// I/O. Fetching data, sending and persisting come later and plug into these
// functions, so the rules stay testable and stay out of React.

export type AutomationDefinition = Pick<
  AutomationRow,
  | "id"
  | "client_id"
  | "document_id"
  | "message_template"
  | "period_preset"
  | "comparison_enabled"
  | "include_detailed_report"
  | "detailed_report_intro"
  | "timezone"
>;

export interface AutomationRunPlan {
  automationId: string;
  clientId: string;
  documentId: string;
  attempt: number;
  scheduledFor: Date;
  period: AutomationPeriod;
  messageTemplate: ReportMessageTemplateId;
  comparisonEnabled: boolean;
  includeDetailedReport: boolean;
  detailedReportIntro: string | null;
}

// Fixes the period of a run at the moment it is planned, from the automation's
// own settings. Retries pass the same scheduledFor with attempt + 1, and keep the
// same period only because they reuse the original plan (see retryPlan).
export function planAutomationRun(
  automation: AutomationDefinition,
  options: { now?: Date; scheduledFor?: Date; attempt?: number } = {},
): AutomationRunPlan {
  const now = options.now ?? new Date();
  return {
    automationId: automation.id,
    clientId: automation.client_id,
    documentId: automation.document_id,
    attempt: options.attempt ?? 1,
    scheduledFor: options.scheduledFor ?? now,
    period: resolveAutomationPeriod(automation.period_preset, {
      now,
      timezone: automation.timezone,
      comparisonEnabled: automation.comparison_enabled,
    }),
    messageTemplate: automation.message_template,
    comparisonEnabled: automation.comparison_enabled,
    includeDetailedReport: automation.include_detailed_report,
    detailedReportIntro: automation.detailed_report_intro ?? null,
  };
}

// A retry is a new record for the SAME period: it must not be re-planned from a
// later "now", or a run delayed past midnight would silently cover another week.
export function retryPlan(previous: AutomationRunPlan): AutomationRunPlan {
  return { ...previous, attempt: previous.attempt + 1 };
}

// The plan of a run that is being retried, rebuilt from the run it repeats. The
// period, comparison and template are the ones the original attempt recorded, never
// re-derived from "now": a retry on Wednesday still reports last weekend.
export function planFromRun(
  automation: Pick<AutomationDefinition, "id" | "client_id" | "document_id" | "include_detailed_report" | "detailed_report_intro">,
  run: AutomationRunRow,
  attempt: number = run.attempt + 1,
): AutomationRunPlan {
  const scheduledFor = new Date(run.scheduled_for);
  return {
    automationId: automation.id,
    clientId: automation.client_id,
    documentId: automation.document_id,
    attempt,
    scheduledFor,
    period: {
      preset: run.period_preset,
      timezone: run.timezone,
      runDate: dateInTimeZone(scheduledFor, run.timezone),
      since: run.period_since,
      until: run.period_until,
      compareSince: run.compare_since,
      compareUntil: run.compare_until,
    },
    messageTemplate: run.message_template,
    comparisonEnabled: run.compare_since !== null,
    includeDetailedReport: automation.include_detailed_report,
    detailedReportIntro: automation.detailed_report_intro ?? null,
  };
}

// The dashboard's own config with the period pinned to this run's exact dates, so
// collecting data for it uses the same collector as the editor. The comparison
// dates are passed explicitly (custom) because "the same days one week earlier" is
// not what the editor's generic "previous period" means.
export function analysisConfigForRun(base: AnalysisConfig, plan: AutomationRunPlan): AnalysisConfig {
  const { since, until, compareSince, compareUntil } = plan.period;
  return {
    ...base,
    preset: "custom",
    since,
    until,
    comparison: plan.comparisonEnabled && compareSince && compareUntil ? "custom" : "none",
    compare_since: plan.comparisonEnabled && compareSince ? compareSince : undefined,
    compare_until: plan.comparisonEnabled && compareUntil ? compareUntil : undefined,
  };
}

export type RunMessageResult =
  | { ok: true; text: string }
  | { ok: false; reason: "template_unavailable" };

// The message is produced by the very same template code "Copiar relatório" uses;
// the automation only supplies client, period, metrics and comparison.
export function buildRunMessage(
  plan: AutomationRunPlan,
  input: {
    clientName: string;
    config: Pick<AnalysisConfig, "primary_metric" | "metrics">;
    data: Pick<AnalysisData, "current" | "previous" | "currency">;
    // The link of THIS run's own immutable report (or the preview placeholder).
    // Only used when the automation asked for the detailed report.
    detailedReportLink?: string;
  },
): RunMessageResult {
  const messageInput = reportMessageInputFromAnalysis({
    clientName: input.clientName,
    data: input.data,
    period: plan.period,
    primaryMetric: input.config.primary_metric,
    metrics: input.config.metrics,
    comparisonEnabled: plan.comparisonEnabled,
  });
  const template = REPORT_MESSAGE_TEMPLATES.find((item) => item.id === plan.messageTemplate);
  // Same availability rule as the editor: no metric for this template -> nothing honest to say.
  if (!template || !reportTemplateAvailable(template, messageInput)) return { ok: false, reason: "template_unavailable" };
  const text = buildReportMessage(plan.messageTemplate, messageInput);
  return {
    ok: true,
    text: plan.includeDetailedReport && input.detailedReportLink
      ? appendDetailedReportLink(text, { intro: plan.detailedReportIntro, link: input.detailedReportLink })
      : text,
  };
}

export const DEFAULT_DETAILED_REPORT_INTRO = "📊 Relatório detalhado\nVeja todas as métricas, gráficos e informações:";
// Shown in previews: the real link only exists once a run has created its own snapshot.
export const DETAILED_REPORT_LINK_PLACEHOLDER = "[LINK GERADO NA EXECUÇÃO]";

// Appends the detailed-report block to a message. The link must be the run's own
// immutable report, never the dashboard's manual share link.
export function appendDetailedReportLink(text: string, options: { intro?: string | null; link: string }) {
  const intro = options.intro?.trim() || DEFAULT_DETAILED_REPORT_INTRO;
  return `${text}\n\n${intro}\n\n${options.link}`;
}

// A frozen, independent copy of the detailed report. It is a deep copy on purpose:
// later changes to the dashboard (or to the objects it was built from) cannot reach
// it, and it is never the dashboard's published_snapshot.
export function buildRunSnapshot(title: string, config: AnalysisConfig, data: AnalysisData) {
  return structuredClone({ title, config, data });
}

// The row inserted when a run is created (before it starts).
export function newRunRecord(plan: AutomationRunPlan) {
  return {
    automation_id: plan.automationId,
    client_id: plan.clientId,
    attempt: plan.attempt,
    scheduled_for: plan.scheduledFor.toISOString(),
    status: "scheduled" as AutomationRunStatus,
    timezone: plan.period.timezone,
    period_preset: plan.period.preset,
    period_since: plan.period.since,
    period_until: plan.period.until,
    compare_since: plan.period.compareSince,
    compare_until: plan.period.compareUntil,
    message_template: plan.messageTemplate,
  };
}

const ALLOWED_TRANSITIONS: Record<AutomationRunStatus, readonly AutomationRunStatus[]> = {
  scheduled: ["running", "skipped", "failed"],
  running: ["sent", "failed", "skipped"],
  sent: [],
  failed: [],
  skipped: [],
};

// Mirrors the database trigger: a run only moves forward and a finished run
// never changes again (a failure is retried as a new attempt).
export function canTransitionRun(from: AutomationRunStatus, to: AutomationRunStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export const isTerminalRunStatus = (status: AutomationRunStatus) => ALLOWED_TRANSITIONS[status].length === 0;
