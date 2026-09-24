import { executeAutomationRun, type ExecutorDeps } from "./executor";
import { MAX_RUN_ATTEMPTS, MAX_SCHEDULE_LATENESS_MS, retryAfterFor, STALE_RUN_MS } from "./failures";
import { planAutomationRun } from "./engine";
import { nextRunAt } from "./schedule";

// ONE general scheduler pass, called by the internal endpoint (Vercel Cron or any
// HTTP caller). There is no cron per client: it finds whatever is due right now.
// Calling it twice, or from two places at once, is safe - the run slot and
// idempotency key make the second call a no-op.

export interface SchedulerSummary {
  reaped: number;
  due: number;
  executed: number;
  sent: number;
  failed: number;
  skipped: number;
  duplicates: number;
  retried: number;
  // True when the time budget ran out; what is left stays due for the next pass.
  deferred: boolean;
}

export async function runSchedulerPass(
  deps: ExecutorDeps,
  options: { budgetMs?: number; maxRuns?: number } = {},
): Promise<SchedulerSummary> {
  const { store } = deps;
  const clock = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const startedAt = clock().getTime();
  const budgetMs = options.budgetMs ?? 45_000;
  const maxRuns = options.maxRuns ?? 10;
  const summary: SchedulerSummary = { reaped: 0, due: 0, executed: 0, sent: 0, failed: 0, skipped: 0, duplicates: 0, retried: 0, deferred: false };
  const outOfTime = () => clock().getTime() - startedAt > budgetMs;
  const count = (status: string) => {
    if (status === "sent") summary.sent += 1;
    else if (status === "failed") summary.failed += 1;
    else if (status === "skipped") summary.skipped += 1;
    else summary.duplicates += 1;
  };

  // 1. Runs whose worker died (timeout, crash) are closed honestly instead of
  // hanging forever. A run that may already have left the building is never retried.
  const now = clock();
  for (const run of await store.listOpenRunsBefore(new Date(now.getTime() - STALE_RUN_MS))) {
    if (run.provider_message_id) {
      await store.finishRun(run.id, "sent", { provider_message_id: run.provider_message_id, provider_status: run.provider_status ?? "accepted" }, now);
    } else if (run.provider_status === "sending") {
      await store.finishRun(run.id, "failed", {
        error_code: "send_unknown",
        error_message: "O envio foi interrompido e não sabemos se a mensagem saiu. Confira no WhatsApp antes de tentar novamente.",
        retryable: false,
      }, now);
    } else {
      const retryAfter = run.trigger_type === "scheduled" ? retryAfterFor(run.attempt, now) : null;
      await store.finishRun(run.id, "failed", {
        error_code: "stale_run",
        error_message: "A execução foi interrompida antes de terminar.",
        retryable: retryAfter !== null,
        retry_after: retryAfter?.toISOString() ?? null,
      }, now);
    }
    summary.reaped += 1;
  }

  // 2. Automations that are due. Paused ones never come back from listDue.
  const due = await store.listDue(clock(), maxRuns);
  summary.due = due.length;
  for (const automation of due) {
    if (outOfTime()) { summary.deferred = true; break; }
    if (automation.status !== "active" || !automation.next_run_at) continue;
    const scheduledFor = new Date(automation.next_run_at);
    const late = clock().getTime() - scheduledFor.getTime();
    if (late > MAX_SCHEDULE_LATENESS_MS) {
      // Too late to be useful: record it, move the schedule on, send nothing.
      const plan = planAutomationRun(automation, { now: scheduledFor, scheduledFor });
      const skipped = await store.insertRun({
        automation_id: automation.id, client_id: automation.client_id, attempt: 1,
        scheduled_for: scheduledFor.toISOString(), trigger_type: "scheduled", parent_run_id: null, requested_by: null,
        idempotency_key: `scheduled:${automation.id}:${scheduledFor.toISOString()}:a1`,
        recipient_label: null, provider: deps.provider.name, timezone: plan.period.timezone, period_preset: plan.period.preset,
        period_since: plan.period.since, period_until: plan.period.until, compare_since: plan.period.compareSince,
        compare_until: plan.period.compareUntil, message_template: plan.messageTemplate,
      });
      if (skipped) {
        const next = nextRunAt({ runWeekday: automation.run_weekday, runTime: automation.run_time, timezone: automation.timezone }, clock()).toISOString();
        await store.advanceNextRun(automation.id, automation.next_run_at, next);
        await store.finishRun(skipped.id, "skipped", {
          error_code: "missed_window",
          error_message: "Execução perdida: o agendador não rodou a tempo, então nada foi enviado.",
        }, clock());
        log("automation_run.skipped", { automation_id: automation.id, run_id: skipped.id, reason: "missed_window" });
        summary.skipped += 1;
      } else summary.duplicates += 1;
      continue;
    }
    const outcome = await executeAutomationRun(deps, { automation, trigger: "scheduled", scheduledFor });
    summary.executed += 1;
    count(outcome.status);
  }

  // 3. Automatic retries of transient failures (bounded; permanent ones never appear here).
  for (const failed of await store.listRetryable(clock(), MAX_RUN_ATTEMPTS, maxRuns)) {
    if (outOfTime()) { summary.deferred = true; break; }
    const automation = await store.loadAutomation(failed.automation_id);
    if (!automation) continue;
    const outcome = await executeAutomationRun(deps, { automation, trigger: failed.trigger_type, scheduledFor: new Date(failed.scheduled_for), retryOf: failed });
    summary.retried += 1;
    count(outcome.status);
  }

  log("automation_scheduler.pass", { ...summary, duration_ms: clock().getTime() - startedAt });
  return summary;
}
