"use client";

import { useState } from "react";
import type { AutomationListItem } from "@/lib/automations/api-types";
import type { AutomationRunRow } from "@/lib/automations/model";
import { resolveAutomationPeriod } from "@/lib/automations/periods";
import { formatPeriod, PERIOD_PRESET_TEXT } from "@/lib/automations/format";
import { maskPhone } from "@/lib/whatsapp/phone";
import { Dialog, FieldMessage } from "./ui";

type Result = { status: "sent" | "failed"; run: AutomationRunRow };

// "Executar agora": the SAME executor as the schedule, triggered by a person. It
// sends a real message to the automation's recipient, so it always asks first and
// says exactly what will go out.
export function AutomationRunDialog({
  clientId,
  automation,
  onClose,
}: {
  clientId: string;
  automation: AutomationListItem;
  onClose: (changed: boolean) => void;
}) {
  // One key per dialog: a double click, or a retry of the same click, is one run.
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const period = resolveAutomationPeriod(automation.period_preset, {
    timezone: automation.timezone,
    comparisonEnabled: automation.comparison_enabled,
  });
  const recipient = automation.recipient.type === "phone"
    ? `${automation.recipient.display_name ? `${automation.recipient.display_name} · ` : ""}${maskPhone(automation.recipient.phone)}`
    : `Grupo ${automation.recipient.display_name ?? ""}`.trim();

  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${clientId}/automations/${automation.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "run", request_id: requestId, confirm: true }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Não foi possível executar a automação.");
      setResult({ status: body.status, run: body.run });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível executar a automação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Executar agora" close={() => onClose(Boolean(result))} busy={busy}>
      <div className="pj-auto-run-dialog">
        {!result ? (
          <>
            <p>Isto envia <strong>agora</strong> uma mensagem real para o destinatário abaixo, usando exatamente o mesmo processo do envio agendado. O agendamento normal não muda.</p>
            <dl>
              <div><dt>Automação</dt><dd>{automation.name}</dd></div>
              <div><dt>Destinatário</dt><dd>{recipient}</dd></div>
              <div><dt>Período mais recente completo</dt><dd>{PERIOD_PRESET_TEXT[automation.period_preset].title} · {formatPeriod(period.since, period.until)}</dd></div>
              <div><dt>Comparação</dt><dd>{period.compareSince && period.compareUntil ? formatPeriod(period.compareSince, period.compareUntil) : "Sem comparação"}</dd></div>
              <div><dt>Relatório detalhado</dt><dd>{automation.include_detailed_report ? "Será gerado e enviado o link" : "Não incluído"}</dd></div>
            </dl>
            <p className="pj-hint">Quer só testar? Edite a automação e use “Enviar teste” com o seu próprio número.</p>
            {error ? <FieldMessage error>{error}</FieldMessage> : null}
            <div className="pj-actions">
              <button type="button" disabled={busy} onClick={() => onClose(false)}>Cancelar</button>
              <button type="button" className="accent" disabled={busy} onClick={() => void send()}>{busy ? "Enviando…" : "Enviar agora"}</button>
            </div>
          </>
        ) : (
          <>
            <div className={`pj-auto-run-result ${result.status === "sent" ? "is-ok" : "is-error"}`} role="status">
              {result.status === "sent" ? (
                <strong>✅ Mensagem enviada.</strong>
              ) : (
                <><strong>❌ Não foi possível enviar.</strong><span>{result.run.error_message}</span></>
              )}
              <span>A execução ficou registrada no histórico{result.status === "failed" ? ", onde você pode tentar novamente" : ""}.</span>
            </div>
            <div className="pj-actions">
              <button type="button" className="accent" onClick={() => onClose(true)}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
