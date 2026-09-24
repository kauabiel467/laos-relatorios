import { normalizeAnalysisConfig, type AnalysisConfig, type AnalysisData } from "@/lib/projects/model";
import { maskPhone, normalizePhone } from "@/lib/whatsapp/phone";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";
import {
  analysisConfigForRun,
  buildRunMessage,
  buildRunSnapshot,
  planAutomationRun,
  planFromRun,
  type AutomationRunPlan,
} from "./engine";
import {
  classifyCollectionError,
  failure,
  redact,
  retryAfterFor,
  STALE_RUN_MS,
  validateCollectedData,
  type RunFailure,
} from "./failures";
import type { AutomationRow, AutomationRunRow, AutomationRunTrigger } from "./model";
import type { NewRun, RunStore } from "./run-store";
import { nextRunAt } from "./schedule";

// THE executor. The scheduler, "Executar agora", "Enviar teste" and "Tentar
// novamente" all call executeAutomationRun; the only thing that differs between
// them is the trigger they pass in. Pipeline:
//   plan -> claim -> validate provider/recipient -> collect -> validate data ->
//   build message -> freeze report (if asked) -> send -> record result.
// Nothing is sent unless every step before it succeeded, and every outcome
// (including refusals) is written to the run history.

export const TEST_MESSAGE_PREFIX = "🧪 *Mensagem de teste* — não foi enviada ao cliente.\n\n";

export interface ExecutorDeps {
  store: RunStore;
  collect: (clientId: string, config: AnalysisConfig) => Promise<AnalysisData>;
  provider: WhatsAppProvider;
  // Public origin used to build the link of a run's detailed report, or null
  // when the environment has no usable one (then a detailed link is refused).
  publicBaseUrl: string | null;
  now?: () => Date;
  newToken?: () => string;
  log?: (event: string, fields: Record<string, unknown>) => void;
}

export interface RunRequest {
  automation: AutomationRow;
  trigger: AutomationRunTrigger;
  // The slot this run belongs to. Scheduled: when the automation was due.
  // Manual/test: the moment of the click.
  scheduledFor: Date;
  requestedBy?: string | null;
  // One value per click/dialog, so a double click is one run.
  requestKey?: string;
  // Test only: the number the person typed (never the automation's recipient).
  testPhone?: string;
  // Set when this run repeats a failed one.
  retryOf?: AutomationRunRow;
}

export type RunOutcome =
  | { status: "duplicate" }
  | { status: "busy" }
  | { status: "sent" | "failed" | "skipped"; run: AutomationRunRow };

class RunFailed extends Error {
  constructor(public readonly detail: RunFailure) {
    super(detail.message);
  }
}

export function runIdempotencyKey(request: RunRequest, attempt: number) {
  const { automation, trigger, scheduledFor } = request;
  if (request.retryOf) return `retry:${request.retryOf.id}`;
  if (trigger === "scheduled") return `scheduled:${automation.id}:${scheduledFor.toISOString()}:a${attempt}`;
  return `${trigger}:${automation.id}:${request.requestKey ?? scheduledFor.toISOString()}:a${attempt}`;
}

export function reportRunUrl(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/+$/, "")}/report/run/${token}`;
}

function resolveRecipient(request: RunRequest, provider: WhatsAppProvider) {
  if (request.trigger === "test") {
    const phone = normalizePhone(request.testPhone ?? "");
    if (!phone.ok) throw Error(phone.message);
    return { ok: true as const, e164: phone.e164, label: maskPhone(phone.e164) };
  }
  const recipient = request.automation.recipient;
  if (recipient.type === "group") {
    return {
      ok: false as const,
      label: "Grupo",
      failure: provider.supportsGroups
        ? failure("recipient_unsupported", "Envio para grupos ainda não está disponível.")
        : failure("recipient_unsupported", "A API oficial do WhatsApp não permite enviar para grupos. Use o número individual do contato."),
    };
  }
  const phone = normalizePhone(recipient.phone);
  if (!phone.ok) return { ok: false as const, label: null, failure: failure("invalid_recipient", phone.message) };
  return { ok: true as const, e164: phone.e164, label: maskPhone(phone.e164) };
}

export async function executeAutomationRun(deps: ExecutorDeps, request: RunRequest): Promise<RunOutcome> {
  const { store, provider } = deps;
  const clock = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const { automation, trigger, retryOf } = request;
  const startedAt = clock();
  const attempt = retryOf ? retryOf.attempt + 1 : 1;

  // 1. Plan: exactly which period and comparison this run covers. A scheduled run
  // is planned from the moment it was DUE, so a late tick still reports the week
  // the automation was meant to report.
  const plan: AutomationRunPlan = retryOf
    ? planFromRun(automation, retryOf, attempt)
    : planAutomationRun(automation, {
        now: trigger === "scheduled" ? request.scheduledFor : startedAt,
        scheduledFor: request.scheduledFor,
        attempt,
      });
  const recipient = resolveRecipient(request, provider);

  if (trigger === "manual" && !retryOf && (await store.hasOpenRunAfter(automation.id, new Date(startedAt.getTime() - STALE_RUN_MS)))) {
    return { status: "busy" };
  }

  // 2. Register the run. The slot (automation, scheduled_for, attempt) and the
  // idempotency key are unique: if anyone already owns this send, we stop here.
  const record: NewRun = {
    automation_id: automation.id,
    client_id: automation.client_id,
    attempt,
    scheduled_for: plan.scheduledFor.toISOString(),
    trigger_type: trigger,
    parent_run_id: retryOf?.id ?? null,
    requested_by: request.requestedBy ?? null,
    idempotency_key: runIdempotencyKey(request, attempt),
    recipient_label: recipient.label,
    provider: provider.name,
    timezone: plan.period.timezone,
    period_preset: plan.period.preset,
    period_since: plan.period.since,
    period_until: plan.period.until,
    compare_since: plan.period.compareSince,
    compare_until: plan.period.compareUntil,
    message_template: plan.messageTemplate,
  };
  const created = await store.insertRun(record);
  if (!created) {
    log("automation_run.duplicate", { automation_id: automation.id, trigger, attempt });
    return { status: "duplicate" };
  }

  // 3. Lock: scheduled -> running. Only one worker ever gets the row.
  const run = await store.claimRun(created.id, startedAt);
  if (!run) return { status: "duplicate" };

  // The schedule moves on as soon as the slot is taken, so a slow or crashed run
  // can never leave the automation "due" forever. Retries and manual/test runs
  // do not touch the schedule.
  if (trigger === "scheduled" && !retryOf) {
    const after = new Date(Math.max(startedAt.getTime(), request.scheduledFor.getTime()));
    const next = nextRunAt(
      { runWeekday: automation.run_weekday, runTime: automation.run_time, timezone: automation.timezone },
      after,
    ).toISOString();
    await store.advanceNextRun(automation.id, automation.next_run_at, next);
  }

  const finishFailed = async (detail: RunFailure) => {
    const at = clock();
    const retryAfter = detail.transient && trigger === "scheduled" ? retryAfterFor(attempt, at) : null;
    const finished = await store.finishRun(
      run.id,
      "failed",
      {
        error_code: detail.code,
        error_message: redact(detail.message),
        retryable: retryAfter !== null,
        retry_after: retryAfter?.toISOString() ?? null,
      },
      at,
    );
    if (trigger !== "test") await store.markRan(automation.id, at);
    log("automation_run.failed", {
      automation_id: automation.id, run_id: run.id, trigger, attempt, error_code: detail.code,
      transient: detail.transient, period: `${plan.period.since}..${plan.period.until}`,
      duration_ms: at.getTime() - startedAt.getTime(),
    });
    return { status: "failed" as const, run: finished ?? run };
  };

  try {
    // 4. Provider and recipient: refuse before doing any expensive work.
    if (!provider.isConfigured()) {
      throw new RunFailed(failure("provider_not_configured", "O envio por WhatsApp ainda não foi configurado neste ambiente."));
    }
    if (!recipient.ok) throw new RunFailed(recipient.failure);

    const dashboard = await store.loadDashboard(automation.client_id, automation.document_id);
    if (!dashboard || dashboard.kind !== "dashboard") {
      throw new RunFailed(failure("document_missing", "O dashboard desta automação não foi encontrado."));
    }
    const clientName = await store.loadClientName(automation.client_id);
    if (!clientName) throw new RunFailed(failure("client_missing", "O projeto desta automação não foi encontrado."));

    // 5-8. Build the message (and the frozen report). A retry that already has
    // both reuses them verbatim: same numbers, same link, nothing recollected.
    let text: string;
    if (retryOf?.message_text) {
      text = retryOf.message_text;
      await store.saveProgress(run.id, { message_text: text });
    } else {
      const dashboardConfig = normalizeAnalysisConfig(dashboard.config);
      const runConfig = analysisConfigForRun(dashboardConfig, plan);

      let collected: AnalysisData;
      try {
        collected = await deps.collect(automation.client_id, runConfig);
      } catch (error) {
        throw new RunFailed(classifyCollectionError(error));
      }
      const checked = validateCollectedData(plan, collected);
      if (!checked.ok) throw new RunFailed(checked.failure);

      let link: string | undefined;
      let token: string | undefined;
      if (plan.includeDetailedReport) {
        if (!deps.publicBaseUrl) {
          throw new RunFailed(failure("public_url_missing", "O endereço público do app não está configurado; não é possível gerar o link do relatório detalhado."));
        }
        token = (deps.newToken ?? (() => crypto.randomUUID()))();
        link = reportRunUrl(deps.publicBaseUrl, token);
      }
      const built = buildRunMessage(plan, {
        clientName,
        config: dashboardConfig,
        data: checked.data,
        detailedReportLink: link,
      });
      if (!built.ok) {
        throw new RunFailed(failure("template_unavailable", "O modelo de mensagem escolhido não tem as métricas necessárias neste dashboard."));
      }
      text = trigger === "test" ? `${TEST_MESSAGE_PREFIX}${built.text}` : built.text;

      // The report is frozen and stored BEFORE the message leaves, so the link
      // in it is already live when the client taps it.
      await store.saveProgress(run.id, {
        message_text: text,
        ...(token ? { report_snapshot: buildRunSnapshot(dashboard.title, runConfig, checked.data), report_share_token: token } : {}),
      });
    }

    // 9. Send. Marked first, so a crash mid-send is never mistaken for "not sent".
    await store.saveProgress(run.id, { provider_status: "sending" });
    const sent = await provider.send({ to: recipient.e164, text });
    if (!sent.ok) {
      const at = clock();
      const retryAfter = sent.transient && trigger === "scheduled" ? retryAfterFor(attempt, at) : null;
      const finished = await store.finishRun(
        run.id,
        "failed",
        {
          error_code: sent.code,
          error_message: redact(sent.message),
          provider_status: sent.providerStatus ?? sent.code,
          retryable: retryAfter !== null,
          retry_after: retryAfter?.toISOString() ?? null,
        },
        at,
      );
      if (trigger !== "test") await store.markRan(automation.id, at);
      log("automation_run.failed", {
        automation_id: automation.id, run_id: run.id, trigger, attempt, error_code: sent.code,
        transient: sent.transient, provider_status: sent.providerStatus, period: `${plan.period.since}..${plan.period.until}`,
        duration_ms: at.getTime() - startedAt.getTime(),
      });
      return { status: "failed", run: finished ?? run };
    }

    // Remember the provider's id first: if recording the result then fails, the
    // reaper can still see the message left and mark the run sent.
    await store.saveProgress(run.id, { provider_message_id: sent.messageId, provider_status: sent.providerStatus });
    const at = clock();
    const finished = await store.finishRun(
      run.id,
      "sent",
      { provider_message_id: sent.messageId, provider_status: sent.providerStatus, error_code: null, error_message: null },
      at,
    );
    if (trigger !== "test") await store.markRan(automation.id, at);
    log("automation_run.sent", {
      automation_id: automation.id, run_id: run.id, trigger, attempt, provider_status: sent.providerStatus,
      period: `${plan.period.since}..${plan.period.until}`, duration_ms: at.getTime() - startedAt.getTime(),
    });
    return { status: "sent", run: finished ?? run };
  } catch (error) {
    if (error instanceof RunFailed) return finishFailed(error.detail);
    // Unexpected: never retried automatically (something may already have been sent).
    log("automation_run.error", { automation_id: automation.id, run_id: run.id, trigger, attempt, error: redact(error instanceof Error ? error.message : "erro") });
    return finishFailed(failure("internal_error", "Erro inesperado ao executar a automação."));
  }
}
