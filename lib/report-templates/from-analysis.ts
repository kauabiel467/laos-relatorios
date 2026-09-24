import type { MetricId, PrimaryKpiId } from "@/lib/metrics/catalog";
import type { AnalysisData } from "@/lib/projects/model";
import type { ReportMessageInput } from "./index";

// The single place that turns collected analysis data into the input of a
// report message template. "Copiar relatório" (the editor) and report
// automations both call this, then hand the result to the same
// buildReportMessage - so the copied text and the automated text cannot drift.
export function reportMessageInputFromAnalysis(args: {
  clientName: string;
  data: Pick<AnalysisData, "current" | "previous" | "currency">;
  period: { since: string; until: string; compareSince?: string | null; compareUntil?: string | null };
  primaryMetric: PrimaryKpiId;
  metrics: MetricId[];
  comparisonEnabled: boolean;
}): ReportMessageInput {
  const { clientName, data, period, comparisonEnabled } = args;
  return {
    client: clientName,
    since: period.since,
    until: period.until,
    compareSince: comparisonEnabled ? period.compareSince ?? undefined : undefined,
    compareUntil: comparisonEnabled ? period.compareUntil ?? undefined : undefined,
    currency: data.currency ?? "BRL",
    primaryMetric: args.primaryMetric,
    metrics: args.metrics,
    current: data.current,
    previous: comparisonEnabled ? data.previous : null,
  };
}
