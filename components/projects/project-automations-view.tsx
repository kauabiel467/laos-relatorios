"use client";

import { useCallback, useEffect, useState } from "react";
import { REPORT_MESSAGE_TEMPLATES } from "@/lib/report-templates";
import type { AutomationListItem, AutomationsPayload } from "@/lib/automations/api-types";
import {
  CHANNEL_LABELS,
  comparisonLabel,
  lastRunLabel,
  nextRunLabel,
  PERIOD_PRESET_TEXT,
  scheduleLabel,
} from "@/lib/automations/format";
import { AutomationForm, type AutomationSubmit } from "./automation-form";
import { AutomationHistory } from "./automation-history";
import { AutomationRunDialog } from "./automation-run-dialog";
import { Dialog, Empty, FieldMessage, LoadingState, Toast } from "./ui";
import { InterfaceIcon } from "./interface-icon";

type Mode =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; automation: AutomationListItem }
  | { type: "history"; automation: AutomationListItem };

const templateLabel = (id: string) => REPORT_MESSAGE_TEMPLATES.find((template) => template.id === id)?.label ?? id;

export function ProjectAutomationsView({
  clientId,
  clientName,
  canManage,
}: {
  clientId: string;
  clientName: string;
  canManage: boolean;
}) {
  const [payload, setPayload] = useState<AutomationsPayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<AutomationListItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [runNow, setRunNow] = useState<AutomationListItem | null>(null);
  const endpoint = `/api/projects/${clientId}/automations`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Não foi possível carregar as automações.");
      setPayload(body as AutomationsPayload);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as automações.");
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Não foi possível concluir.");
    return result;
  }

  async function run(task: () => Promise<void>, onError: (message: string) => void) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      await load();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  function save(submit: AutomationSubmit) {
    setFormError("");
    void run(async () => {
      if (submit.kind === "single") await post({ action: "create", input: submit.input });
      else if (submit.kind === "routine") await post({ action: "create_routine", routine: submit.routine, name_base: submit.nameBase || undefined, base: submit.base });
      else await post({ action: "update", id: submit.id, patch: submit.patch });
      setToast(submit.kind === "update" ? "Automação atualizada." : submit.kind === "routine" ? "Automações criadas." : "Automação criada.");
      setMode({ type: "list" });
    }, setFormError);
  }

  function toggle(automation: AutomationListItem) {
    const status = automation.status === "active" ? "paused" : "active";
    void run(async () => {
      await post({ action: "set_status", id: automation.id, status });
      setToast(status === "active" ? "Automação ativada." : "Automação pausada. A configuração foi mantida.");
    }, setToast);
  }

  function remove(automation: AutomationListItem) {
    setDeleteError("");
    void run(async () => {
      await post({ action: "delete", id: automation.id });
      setConfirmDelete(null);
      setToast("Automação excluída.");
    }, setDeleteError);
  }

  if (loadError && !payload) {
    return (
      <section className="pj-panel">
        <FieldMessage error>{loadError}</FieldMessage>
        <button type="button" onClick={() => void load()}>Tentar novamente</button>
      </section>
    );
  }
  if (!payload) return <LoadingState label="Carregando automações…" />;

  if (mode.type === "create" || mode.type === "edit") {
    const editing = mode.type === "edit" ? mode.automation : undefined;
    return (
      <section className="pj-panel pj-auto-editor" aria-labelledby="automation-form-title">
        <div className="pj-section-heading">
          <div>
            <span className="pj-section-label">{editing ? "EDITAR AUTOMAÇÃO" : "NOVA AUTOMAÇÃO"}</span>
            <h2 id="automation-form-title">{editing ? editing.name : "Criar automação de relatório"}</h2>
            <p>Defina o relatório, o período e quando ele deve ser enviado. A prévia mostra exatamente o que o cliente receberá.</p>
          </div>
        </div>
        <AutomationForm
          clientId={clientId}
          initial={editing}
          dashboards={payload.dashboards}
          clientName={payload.project.name || clientName}
          defaultTimezone={payload.project.defaultTimezone}
          busy={busy}
          error={formError}
          onCancel={() => { setFormError(""); setMode({ type: "list" }); }}
          onSubmit={save}
        />
      </section>
    );
  }

  if (mode.type === "history") {
    return <AutomationHistory clientId={clientId} automation={mode.automation} canManage={canManage} onBack={() => setMode({ type: "list" })} />;
  }

  return (
    <section className="pj-panel pj-auto" aria-labelledby="automations-title">
      <div className="pj-section-heading">
        <div>
          <span className="pj-section-label">AUTOMAÇÕES</span>
          <h2 id="automations-title">Relatórios automáticos</h2>
          <p>Configure quando e como os relatórios deste projeto são montados e enviados ao cliente.</p>
        </div>
        <button type="button" className="accent" disabled={!canManage} title={canManage ? undefined : "Somente dono e gerente da equipe criam automações."} onClick={() => { setFormError(""); setMode({ type: "create" }); }}>
          <InterfaceIcon name="plus" size={18} /> Nova automação
        </button>
      </div>
      {!canManage ? <div className="pj-hint">Seu papel permite visualizar as automações. Somente dono e gerente da equipe podem criar, editar, pausar ou excluir.</div> : null}
      {loadError ? <FieldMessage error>{loadError}</FieldMessage> : null}

      {!payload.automations.length ? (
        <Empty title="Você ainda não possui automações.">
          <p>Automatize o relatório semanal deste projeto: o LAOS calcula o período certo, monta a mensagem e registra cada execução.</p>
          {canManage ? <button type="button" className="accent" onClick={() => setMode({ type: "create" })}>Criar primeira automação</button> : null}
        </Empty>
      ) : (
        <ul className="pj-auto-list">
          {payload.automations.map((automation) => (
            <li key={automation.id}>
              <article className={`pj-auto-card ${automation.status === "paused" ? "is-paused" : ""}`}>
                <header>
                  <div>
                    <h3>{automation.name}</h3>
                    <span className="pj-auto-tag">{templateLabel(automation.message_template)}</span>
                  </div>
                  <span className={`pj-auto-status is-${automation.status}`}>{automation.status === "active" ? "Ativo" : "Pausado"}</span>
                </header>
                <dl className="pj-auto-facts">
                  <div><dt>Período</dt><dd>{PERIOD_PRESET_TEXT[automation.period_preset].short}</dd></div>
                  <div><dt>Comparação</dt><dd>{comparisonLabel(automation)}</dd></div>
                  <div><dt>Frequência</dt><dd>Semanal · {scheduleLabel(automation)}</dd></div>
                  <div><dt>Canal</dt><dd>{CHANNEL_LABELS[automation.channel] ?? automation.channel}</dd></div>
                  <div><dt>Próxima execução</dt><dd>{nextRunLabel(automation)}</dd></div>
                  <div><dt>Última execução</dt><dd>{lastRunLabel(automation.last_run)}</dd></div>
                </dl>
                {automation.include_detailed_report ? <p className="pj-auto-note">Inclui link do relatório detalhado.</p> : null}
                <footer className="pj-auto-card-actions">
                  <button type="button" disabled={!canManage} onClick={() => { setFormError(""); setMode({ type: "edit", automation }); }}>Editar</button>
                  <button type="button" disabled={!canManage || busy} onClick={() => toggle(automation)}>{automation.status === "active" ? "Pausar" : "Ativar"}</button>
                  <button type="button" disabled={!canManage || busy} title={canManage ? "Envia agora, pelo mesmo processo do envio agendado." : "Somente dono e gerente da equipe executam automações."} onClick={() => setRunNow(automation)}>Executar agora</button>
                  <button type="button" onClick={() => setMode({ type: "history", automation })}>Histórico</button>
                  <button type="button" className="danger" disabled={!canManage} onClick={() => { setDeleteError(""); setConfirmDelete(automation); }}>Excluir</button>
                </footer>
              </article>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete ? (
        <Dialog title="Excluir automação?" close={() => setConfirmDelete(null)} busy={busy}>
          <div className="pj-confirm-content">
            <p>A automação “{confirmDelete.name}” será removida. Se ela já tiver histórico de execuções, pause-a em vez de excluir.</p>
            {deleteError ? <FieldMessage error>{deleteError}</FieldMessage> : null}
          </div>
          <div className="pj-actions">
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(null)}>Manter</button>
            <button type="button" className="danger" disabled={busy} onClick={() => remove(confirmDelete)}>{busy ? "Excluindo…" : "Excluir automação"}</button>
          </div>
        </Dialog>
      ) : null}
      {runNow ? (
        <AutomationRunDialog
          clientId={clientId}
          automation={runNow}
          onClose={(changed) => {
            setRunNow(null);
            if (changed) void load();
          }}
        />
      ) : null}
      {toast ? <Toast message={toast} close={() => setToast("")} /> : null}
    </section>
  );
}
