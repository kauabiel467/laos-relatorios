import type { AnalysisData } from "@/lib/projects/model";
import type { MetricValues } from "@/lib/metrics/catalog";
import { MetaConnectionError, MetaGraphError } from "@/lib/integrations/meta-graph";
import type { AutomationRunPlan } from "./engine";

// Everything that can go wrong in a run, classified once. A failure has a stable
// code (history and retry logic key off it), a message written for people, and a
// verdict on whether trying again later can help.

export interface RunFailure {
  code: string;
  message: string;
  // Timeouts, 429 and 5xx clear up on their own; a revoked token or an invalid
  // number does not, so those fail once instead of looping.
  transient: boolean;
}

export const failure = (code: string, message: string, transient = false): RunFailure => ({ code, message, transient });

// 3 tries in total: the original plus two automatic retries.
export const MAX_RUN_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [5, 30];

// When the next automatic try may happen, or null once the attempts are used up.
export function retryAfterFor(attempt: number, now: Date): Date | null {
  const minutes = RETRY_BACKOFF_MINUTES[attempt - 1];
  if (attempt >= MAX_RUN_ATTEMPTS || minutes === undefined) return null;
  return new Date(now.getTime() + minutes * 60_000);
}

// A scheduled run older than this is not sent: a report announcing "the weekend"
// two days late is worse than a clearly recorded skip.
export const MAX_SCHEDULE_LATENESS_MS = 36 * 60 * 60_000;
// A run stuck in scheduled/running for this long lost its worker (timeout, crash).
export const STALE_RUN_MS = 10 * 60_000;

// Provider and Graph messages can echo request details; nothing that looks like
// a credential is ever stored or logged.
export function redact(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [oculto]")
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "[oculto]")
    .replace(
      /(access_token|refresh_token|client_secret|password|token|secret|authorization)(["'=:\s]+)(?!Bearer \[oculto\])[^\s"'&,}]+/gi,
      "$1$2[oculto]",
    )
    .slice(0, 500);
}

const COLLECTION_FAILED = "Não foi possível coletar dados para o período.";

export function classifyCollectionError(error: unknown): RunFailure {
  if (error instanceof MetaConnectionError) {
    return error.kind === "not_linked"
      ? failure("integration_not_linked", "Meta Ads não está conectada a este projeto. Conecte a conta nas integrações.")
      : failure("integration_disconnected", "Meta Ads desconectada. Reconecte a conta nas integrações do projeto.");
  }
  if (error instanceof MetaGraphError) {
    if (error.code === 190) {
      return failure("integration_disconnected", "Meta Ads desconectada: a autorização expirou ou foi revogada. Reconecte a conta.");
    }
    if (error.code === 10 || error.code === 200) {
      return failure("integration_permission", "A Meta não liberou as permissões necessárias para consultar esta conta.");
    }
    if (error.transient || [1, 2, 4, 17, 32, 613].includes(error.code ?? -1)) {
      return failure("collection_transient", `${COLLECTION_FAILED} A Meta está temporariamente indisponível.`, true);
    }
    return failure("collection_failed", COLLECTION_FAILED);
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError" || /excedeu o tempo|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(error.message)) {
      return failure("collection_transient", `${COLLECTION_FAILED} A consulta demorou demais.`, true);
    }
    if (/campanha selecionada não pertence/i.test(error.message)) {
      return failure("collection_failed", "Uma campanha do dashboard não pertence mais à conta Meta do projeto.");
    }
  }
  return failure("collection_failed", COLLECTION_FAILED);
}

const hasAnyMetric = (values: MetricValues | null | undefined) =>
  Boolean(values) && Object.values(values as MetricValues).some((value) => typeof value === "number" && Number.isFinite(value));

export type CollectedDataCheck = { ok: true; data: AnalysisData } | { ok: false; failure: RunFailure };

// The last gate before anything is built or sent. Data is only accepted when it
// is for THIS run's period and actually contains numbers; an empty collection is
// a failure, never a report full of zeros.
export function validateCollectedData(plan: AutomationRunPlan, data: AnalysisData | null | undefined): CollectedDataCheck {
  if (!data) return { ok: false, failure: failure("collection_failed", COLLECTION_FAILED) };
  const effective = data.effective_period;
  if (!effective || effective.since !== plan.period.since || effective.until !== plan.period.until) {
    return { ok: false, failure: failure("period_mismatch", "Os dados coletados não correspondem ao período da automação.") };
  }
  if (plan.comparisonEnabled && (effective.compare_since !== plan.period.compareSince || effective.compare_until !== plan.period.compareUntil)) {
    return { ok: false, failure: failure("period_mismatch", "Os dados coletados não correspondem ao período de comparação da automação.") };
  }
  if (!hasAnyMetric(data.current)) {
    return {
      ok: false,
      failure: failure("no_data", `${COLLECTION_FAILED} A Meta não retornou resultados entre ${plan.period.since} e ${plan.period.until}.`),
    };
  }
  // A comparison week with no data at all is not "everything dropped to zero": it
  // is dropped from BOTH the message and the report, and the report says so.
  if (plan.comparisonEnabled && !hasAnyMetric(data.previous)) {
    return {
      ok: true,
      data: { ...data, previous: null, warnings: [...data.warnings, "Sem dados no período de comparação."] },
    };
  }
  return { ok: true, data };
}
