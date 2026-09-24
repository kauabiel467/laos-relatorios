"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutomationListItem } from "@/lib/automations/api-types";
import type { AutomationRunRow, AutomationRunStatus } from "@/lib/automations/model";
import { CHANNEL_LABELS, formatInstantFull, formatPeriod, RUN_STATUS_LABELS, RUN_TRIGGER_LABELS, runReportToken } from "@/lib/automations/format";
import { Empty, FieldMessage, LoadingState } from "./ui";

const STATUS_ICON: Record<AutomationRunStatus, string> = { scheduled: "🕒", running: "⏳", sent: "✅", failed: "❌", skipped: "⏭️" };

export function AutomationHistory({
  clientId,
  automation,
  canManage,
  onBack,
}: {
  clientId: string;
  automation: AutomationListItem;
  canManage: boolean;
  onBack: () => void;
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; runs: AutomationRunRow[] }>({ status: "loading" });
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${clientId}/automations?runs=${automation.id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Não foi possível carregar o histórico.");
      setState({ status: "ready", runs: body.runs as AutomationRunRow[] });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Não foi possível carregar o histórico." });
    }
  }, [clientId, automation.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runs = useMemo(() => (state.status === "ready" ? state.runs : []), [state]);
  const byId = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs]);
  // A failed run can be retried until something already retried it.
  const retried = useMemo(() => new Set(runs.map((run) => run.parent_run_id).filter(Boolean) as string[]), [runs]);

  async function retry(run: AutomationRunRow) {
    if (retrying) return;
    setRetrying(run.id);
    setRetryMessage(null);
    try {
      const response = await fetch(`/api/projects/${clientId}/automations/${automation.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "retry", run_id: run.id }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Não foi possível tentar novamente.");
      setRetryMessage(body.status === "sent"
        ? { error: false, text: "Mensagem enviada." }
        : { error: true, text: body.run?.error_message || "A nova tentativa também falhou." });
    } catch (error) {
      setRetryMessage({ error: true, text: error instanceof Error ? error.message : "Não foi possível tentar novamente." });
    } finally {
      setRetrying(null);
      await load();
    }
  }

  return (
    <section className="pj-panel pj-auto-history" aria-labelledby="automation-history-title">
      <div className="pj-section-heading">
        <div>
          <span className="pj-section-label">HISTÓRICO</span>
          <h2 id="automation-history-title">{automation.name}</h2>
          <p>Cada execução guarda o período, a mensagem e o relatório exatamente como foram naquele dia — mudar o dashboard depois não altera o histórico.</p>
        </div>
        <button type="button" onClick={onBack}>Voltar às automações</button>
      </div>
      {state.status === "loading" ? <LoadingState label="Carregando histórico…" /> : null}
      {state.status === "error" ? <FieldMessage error>{state.message}</FieldMessage> : null}
      {retryMessage ? <FieldMessage error={retryMessage.error}>{retryMessage.text}</FieldMessage> : null}
      {state.status === "ready" && !runs.length ? (
        <Empty title="Nenhuma execução ainda">
          As execuções aparecem aqui assim que a automação rodar.
        </Empty>
      ) : null}
      {state.status === "ready" && runs.length ? (
        <ol className="pj-auto-runs">
          {runs.map((run) => {
            const token = runReportToken(run, byId);
            const canRetry = canManage && run.status === "failed" && run.trigger_type !== "test" && !retried.has(run.id);
            return (
              <li key={run.id} className={`pj-auto-run is-${run.status}`}>
                <div className="pj-auto-run-head">
                  <strong>{formatInstantFull(run.trigger_type === "scheduled" ? run.scheduled_for : (run.started_at ?? run.scheduled_for), run.timezone)}</strong>
                  <span className={`pj-auto-status is-${run.status}`}>{STATUS_ICON[run.status]} {RUN_STATUS_LABELS[run.status]}{run.attempt > 1 ? ` · tentativa ${run.attempt}` : ""}</span>
                </div>
                <dl className="pj-auto-run-facts">
                  <div><dt>Origem</dt><dd>{RUN_TRIGGER_LABELS[run.trigger_type]}</dd></div>
                  <div><dt>Período</dt><dd>{formatPeriod(run.period_since, run.period_until, " → ")}</dd></div>
                  <div><dt>Comparação</dt><dd>{run.compare_since && run.compare_until ? formatPeriod(run.compare_since, run.compare_until, " → ") : "Sem comparação"}</dd></div>
                  <div><dt>Canal</dt><dd>{CHANNEL_LABELS[automation.channel] ?? automation.channel}</dd></div>
                  <div><dt>Destinatário</dt><dd>{run.recipient_label ?? "—"}</dd></div>
                  <div><dt>Relatório detalhado</dt><dd>{token ? "Incluído" : "—"}</dd></div>
                  {run.provider_message_id ? <div><dt>ID no WhatsApp</dt><dd className="pj-auto-mono">{run.provider_message_id}</dd></div> : null}
                </dl>
                {run.error_message ? <p className="pj-auto-run-error" role="alert">{run.error_message}</p> : null}
                {run.status === "failed" && run.retryable && run.retry_after && !retried.has(run.id) ? (
                  <p className="pj-hint">Nova tentativa automática após {formatInstantFull(run.retry_after, run.timezone)}.</p>
                ) : null}
                <div className="pj-auto-run-actions">
                  {run.message_text ? (
                    <details>
                      <summary>Ver mensagem</summary>
                      <pre className="pj-auto-message">{run.message_text}</pre>
                    </details>
                  ) : null}
                  {token ? <a className="pj-button" href={`/report/run/${token}`} target="_blank" rel="noopener noreferrer">Abrir relatório</a> : null}
                  {canRetry ? (
                    <button type="button" disabled={Boolean(retrying)} onClick={() => void retry(run)}>
                      {retrying === run.id ? "Tentando…" : "Tentar novamente"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
