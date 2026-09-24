"use client";

import { useEffect, useState } from "react";
import type { AutomationListItem } from "@/lib/automations/api-types";
import type { AutomationRunRow, AutomationRunStatus } from "@/lib/automations/model";
import { CHANNEL_LABELS, formatInstantFull, formatPeriod, RUN_STATUS_LABELS } from "@/lib/automations/format";
import { Empty, FieldMessage, LoadingState } from "./ui";

const STATUS_ICON: Record<AutomationRunStatus, string> = { scheduled: "🕒", running: "⏳", sent: "✅", failed: "❌", skipped: "⏭️" };

export function AutomationHistory({
  clientId,
  automation,
  onBack,
}: {
  clientId: string;
  automation: AutomationListItem;
  onBack: () => void;
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; runs: AutomationRunRow[] }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${clientId}/automations?runs=${automation.id}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || "Não foi possível carregar o histórico.");
        return body.runs as AutomationRunRow[];
      })
      .then((runs) => !cancelled && setState({ status: "ready", runs }))
      .catch((error: Error) => !cancelled && setState({ status: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
  }, [clientId, automation.id]);

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
      {state.status === "ready" && !state.runs.length ? (
        <Empty title="Nenhuma execução ainda">
          As execuções aparecem aqui assim que a automação rodar.
        </Empty>
      ) : null}
      {state.status === "ready" && state.runs.length ? (
        <ol className="pj-auto-runs">
          {state.runs.map((run) => (
            <li key={run.id} className={`pj-auto-run is-${run.status}`}>
              <div className="pj-auto-run-head">
                <strong>{formatInstantFull(run.scheduled_for, run.timezone)}</strong>
                <span className={`pj-auto-status is-${run.status}`}>{STATUS_ICON[run.status]} {RUN_STATUS_LABELS[run.status]}{run.attempt > 1 ? ` · tentativa ${run.attempt}` : ""}</span>
              </div>
              <dl className="pj-auto-run-facts">
                <div><dt>Período</dt><dd>{formatPeriod(run.period_since, run.period_until, " → ")}</dd></div>
                {run.compare_since && run.compare_until ? <div><dt>Comparação</dt><dd>{formatPeriod(run.compare_since, run.compare_until, " → ")}</dd></div> : null}
                <div><dt>Canal</dt><dd>{CHANNEL_LABELS[automation.channel] ?? automation.channel}</dd></div>
                <div><dt>Relatório detalhado</dt><dd>{run.report_share_token ? "Incluído" : "—"}</dd></div>
              </dl>
              {run.error_message ? <p className="pj-auto-run-error" role="alert">{run.error_message}</p> : null}
              {run.message_text ? (
                <details>
                  <summary>Ver mensagem enviada</summary>
                  <pre className="pj-auto-message">{run.message_text}</pre>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
