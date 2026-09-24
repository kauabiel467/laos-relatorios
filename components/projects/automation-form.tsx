"use client";

import { useMemo, useState } from "react";
import { PROJECT_TIMEZONES } from "@/lib/projects/config";
import { REPORT_MESSAGE_TEMPLATES, reportTemplateAvailable, type ReportMessageTemplateId } from "@/lib/report-templates";
import { reportMessageInputFromAnalysis } from "@/lib/report-templates/from-analysis";
import type { AutomationListItem, DashboardOption } from "@/lib/automations/api-types";
import { DEFAULT_DETAILED_REPORT_INTRO } from "@/lib/automations/engine";
import {
  AUTOMATION_ROUTINES,
  automationInputSchema,
  buildRoutineAutomations,
  type AutomationRoutineKey,
} from "@/lib/automations/model";
import { AUTOMATION_PERIOD_PRESETS, type AutomationPeriodPreset } from "@/lib/automations/periods";
import { buildAutomationPreview, EXAMPLE_PREVIEW_SAMPLE, type AutomationPreview } from "@/lib/automations/preview";
import { formatInstant, formatPeriod, PERIOD_PRESET_TEXT, weekdayName, weekdayOptions } from "@/lib/automations/format";
import { FieldMessage } from "./ui";

type Kind = "single" | AutomationRoutineKey;

interface FormState {
  kind: Kind;
  name: string;
  nameBase: string;
  documentId: string;
  template: ReportMessageTemplateId;
  preset: AutomationPeriodPreset;
  weekday: number;
  time: string;
  timezone: string;
  comparison: boolean;
  includeLink: boolean;
  intro: string;
  recipientType: "phone" | "group";
  phone: string;
  groupId: string;
  recipientName: string;
  activate: boolean;
}

export type AutomationSubmit =
  | { kind: "single"; input: Record<string, unknown> }
  | { kind: "routine"; routine: AutomationRoutineKey; nameBase: string; base: Record<string, unknown> }
  | { kind: "update"; id: string; patch: Record<string, unknown> };

function initialState(initial: AutomationListItem | undefined, dashboards: DashboardOption[], defaultTimezone: string): FormState {
  const recipient = initial?.recipient;
  return {
    kind: "single",
    name: initial?.name ?? "",
    nameBase: "",
    documentId: initial?.document_id ?? dashboards[0]?.id ?? "",
    template: initial?.message_template ?? "sales",
    preset: initial?.period_preset ?? "friday_sunday",
    weekday: initial?.run_weekday ?? 1,
    time: initial?.run_time.slice(0, 5) ?? "09:00",
    timezone: initial?.timezone ?? defaultTimezone,
    comparison: initial?.comparison_enabled ?? true,
    includeLink: initial?.include_detailed_report ?? true,
    intro: initial?.detailed_report_intro ?? "",
    recipientType: recipient?.type ?? "phone",
    phone: recipient?.type === "phone" ? recipient.phone : "",
    groupId: recipient?.type === "group" ? recipient.group_id : "",
    recipientName: recipient?.display_name ?? "",
    activate: initial?.status === "active",
  };
}

// "Enviar teste": sends the automation as configured RIGHT NOW in this form (saved
// or not) to a number typed here. It never touches the schedule, is recorded as a
// test, and refuses the real recipient unless the person confirms it.
function TestSend({ clientId, automation, overrides }: { clientId: string; automation: AutomationListItem; overrides: Record<string, unknown> }) {
  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function send(confirmProduction = false) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${clientId}/automations/${automation.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "test",
          request_id: requestId,
          phone,
          confirm_production_recipient: confirmProduction || undefined,
          overrides: Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
        }),
      });
      const body = await response.json();
      if (response.status === 409 && body.code === "confirm_production_recipient") {
        setNeedsConfirm(true);
        setMessage({ error: true, text: body.error });
        return;
      }
      if (!response.ok) throw Error(body.error || "Não foi possível enviar o teste.");
      setNeedsConfirm(false);
      setMessage(body.status === "sent"
        ? { error: false, text: "Teste enviado. Ele aparece no histórico como “Teste”." }
        : { error: true, text: body.run?.error_message || "O teste falhou." });
      setRequestId(crypto.randomUUID());
    } catch (caught) {
      setMessage({ error: true, text: caught instanceof Error ? caught.message : "Não foi possível enviar o teste." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="pj-auto-test">
      <legend>Enviar teste</legend>
      <p className="pj-hint">Envia esta configuração agora para o número abaixo (não para o cliente). A mensagem vem marcada como teste e o agendamento não muda.</p>
      <div className="pj-auto-row">
        <label>
          Seu telefone com DDI
          <input
            value={phone}
            onChange={(event) => { setPhone(event.target.value); setNeedsConfirm(false); }}
            // Enter here must send the test, never submit (save) the whole form.
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send(false); } }}
            inputMode="tel"
            placeholder="+5511999999999"
          />
        </label>
        <button type="button" disabled={busy || !phone.trim()} onClick={() => void send(false)}>{busy ? "Enviando…" : "Enviar teste"}</button>
      </div>
      {needsConfirm ? <button type="button" className="danger" disabled={busy} onClick={() => void send(true)}>Enviar mesmo assim ao destinatário real</button> : null}
      {message ? <FieldMessage error={message.error}>{message.text}</FieldMessage> : null}
    </fieldset>
  );
}

const KIND_OPTIONS: Array<{ value: Kind; title: string; help: string }> = [
  { value: "single", title: "Automação única", help: "Um relatório, no dia e período que você escolher." },
  { value: "rotina_laos", title: "Rotina LAOS — 2 relatórios por semana", help: "Segunda (sexta → domingo) e sexta (segunda → quinta)." },
  { value: "semanal_completo", title: "Semanal completo", help: "Toda segunda, com a semana anterior inteira (segunda → domingo)." },
];

export function AutomationForm({
  clientId,
  initial,
  dashboards,
  clientName,
  defaultTimezone,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  clientId: string;
  initial?: AutomationListItem;
  dashboards: DashboardOption[];
  clientName: string;
  defaultTimezone: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (submit: AutomationSubmit) => void;
}) {
  const editing = Boolean(initial);
  const [form, setForm] = useState<FormState>(() => initialState(initial, dashboards, defaultTimezone));
  const [localError, setLocalError] = useState("");
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const dashboard = dashboards.find((item) => item.id === form.documentId);
  const routine = form.kind === "single" ? null : AUTOMATION_ROUTINES[form.kind];
  const timezones = useMemo(() => Array.from(new Set([defaultTimezone, form.timezone, ...PROJECT_TIMEZONES])), [defaultTimezone, form.timezone]);

  // One entry per report this form will create: a routine has several, each with
  // its own fixed weekday and period.
  const items = useMemo(
    () =>
      routine
        ? routine.items.map((item) => ({ label: item.suffix, weekday: item.run_weekday as number, preset: item.period_preset as AutomationPeriodPreset }))
        : [{ label: null as string | null, weekday: form.weekday, preset: form.preset }],
    [routine, form.weekday, form.preset],
  );

  const previews = useMemo(
    () =>
      items.map((item): AutomationPreview | null => {
        try {
          return buildAutomationPreview({
            clientName,
            sample: dashboard?.sample ?? null,
            form: {
              message_template: form.template,
              period_preset: item.preset,
              comparison_enabled: form.comparison,
              include_detailed_report: form.includeLink,
              detailed_report_intro: form.intro.trim() || null,
              timezone: form.timezone,
              run_weekday: item.weekday as 1,
              run_time: form.time,
            },
          });
        } catch {
          return null;
        }
      }),
    [items, clientName, dashboard, form.template, form.comparison, form.includeLink, form.intro, form.timezone, form.time],
  );

  // Which templates have something honest to say for the selected dashboard, using
  // the same availability rule as the "Copiar relatório" menu.
  const templateAvailable = useMemo(() => {
    const sample = dashboard?.sample ?? EXAMPLE_PREVIEW_SAMPLE;
    const input = reportMessageInputFromAnalysis({
      clientName,
      data: { currency: sample.currency, current: sample.current, previous: sample.previous },
      period: { since: "2026-01-01", until: "2026-01-02" },
      primaryMetric: sample.primary_metric,
      metrics: sample.metrics,
      comparisonEnabled: false,
    });
    return new Map(REPORT_MESSAGE_TEMPLATES.map((template) => [template.id, reportTemplateAvailable(template, input)]));
  }, [dashboard, clientName]);

  const recipient = form.recipientType === "phone"
    ? { type: "phone", phone: form.phone, display_name: form.recipientName || undefined }
    : { type: "group", group_id: form.groupId, display_name: form.recipientName || undefined };
  const shared = {
    document_id: form.documentId,
    message_template: form.template,
    comparison_enabled: form.comparison,
    include_detailed_report: form.includeLink,
    detailed_report_intro: form.intro.trim() || null,
    frequency: "weekly",
    run_time: form.time,
    timezone: form.timezone,
    channel: "whatsapp",
    recipient,
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError("");
    try {
      if (initial) {
        const input = automationInputSchema.parse({ ...shared, name: form.name, period_preset: form.preset, run_weekday: form.weekday, status: initial.status });
        const { status: _status, ...patch } = input;
        void _status;
        onSubmit({ kind: "update", id: initial.id, patch });
      } else if (routine && form.kind !== "single") {
        // Validates exactly as the server will, before anything is sent.
        buildRoutineAutomations(form.kind, { ...shared, status: form.activate ? "active" : "paused" } as never, form.nameBase);
        onSubmit({ kind: "routine", routine: form.kind, nameBase: form.nameBase, base: { ...shared, status: form.activate ? "active" : "paused" } });
      } else {
        const input = automationInputSchema.parse({ ...shared, name: form.name, period_preset: form.preset, run_weekday: form.weekday, status: form.activate ? "active" : "paused" });
        onSubmit({ kind: "single", input });
      }
    } catch (caught) {
      const issues = (caught as { issues?: Array<{ message: string }> }).issues;
      setLocalError(issues?.[0]?.message || "Confira os campos da automação.");
    }
  }

  const submitLabel = editing ? "Salvar alterações" : routine ? `Criar ${routine.items.length === 1 ? "automação" : `${routine.items.length} automações`}` : "Criar automação";
  const hasDashboards = dashboards.length > 0;

  return (
    <form className="pj-auto-form" onSubmit={submit} noValidate>
      <div className="pj-auto-form-main">
        {!editing ? (
          <fieldset className="pj-auto-step">
            <legend>Como você quer começar?</legend>
            <div className="pj-auto-choices">
              {KIND_OPTIONS.map((option) => (
                <label key={option.value} className={`pj-auto-choice ${form.kind === option.value ? "is-selected" : ""}`}>
                  <input type="radio" name="kind" value={option.value} checked={form.kind === option.value} onChange={() => set("kind", option.value)} />
                  <span><strong>{option.title}</strong><small>{option.help}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="pj-auto-step">
          <legend>1 · Identificação</legend>
          {routine ? (
            <label>
              <span>Nome base <small>(opcional)</small></span>
              <input value={form.nameBase} onChange={(event) => set("nameBase", event.target.value)} maxLength={80} placeholder={routine.label} />
              <small>Cada relatório recebe o nome base + o dia, ex.: “{form.nameBase.trim() || routine.label} — {routine.items[0].suffix}”.</small>
            </label>
          ) : (
            <label>
              Nome da automação
              <input value={form.name} onChange={(event) => set("name", event.target.value)} maxLength={120} placeholder="Relatório segunda-feira" required />
            </label>
          )}
          <label>
            Dashboard relacionado
            <select value={form.documentId} onChange={(event) => set("documentId", event.target.value)} disabled={!hasDashboards} required>
              {!hasDashboards ? <option value="">Nenhum dashboard neste projeto</option> : null}
              {dashboards.map((item) => (
                <option key={item.id} value={item.id}>{item.title}{item.status === "published" ? "" : " (rascunho)"}</option>
              ))}
            </select>
            {!hasDashboards ? <small>Crie um dashboard neste projeto antes de automatizar um relatório.</small> : <small>É de onde vêm as métricas e a configuração do relatório.</small>}
          </label>
          <div className="pj-auto-row">
            <label>
              Enviar para
              <select value={form.recipientType} onChange={(event) => set("recipientType", event.target.value as "phone" | "group")}>
                <option value="phone">Telefone (WhatsApp)</option>
                <option value="group">Grupo do WhatsApp</option>
              </select>
            </label>
            {form.recipientType === "phone" ? (
              <label>
                Telefone com DDI
                <input value={form.phone} onChange={(event) => set("phone", event.target.value)} inputMode="tel" placeholder="+5511999999999" />
              </label>
            ) : (
              <label>
                Identificador do grupo
                <input value={form.groupId} onChange={(event) => set("groupId", event.target.value)} maxLength={120} placeholder="ID do grupo" />
              </label>
            )}
            <label>
              <span>Nome do destinatário <small>(opcional)</small></span>
              <input value={form.recipientName} onChange={(event) => set("recipientName", event.target.value)} maxLength={120} placeholder={clientName} />
            </label>
          </div>
          <small>O envio é feito pelo WhatsApp oficial da agência. Para testar antes de ativar, use “Enviar teste”, disponível ao editar a automação.</small>
        </fieldset>

        <fieldset className="pj-auto-step">
          <legend>2 · Modelo do relatório</legend>
          <div className="pj-auto-choices pj-auto-choices-compact">
            {REPORT_MESSAGE_TEMPLATES.map((template) => {
              const available = templateAvailable.get(template.id) ?? true;
              return (
                <label key={template.id} className={`pj-auto-choice ${form.template === template.id ? "is-selected" : ""}`}>
                  <input type="radio" name="template" value={template.id} checked={form.template === template.id} onChange={() => set("template", template.id)} />
                  <span>
                    <strong>{template.label}</strong>
                    <small>{available ? template.description : "O dashboard escolhido não tem métricas para este modelo."}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="pj-auto-step">
          <legend>3 · Período</legend>
          {routine ? (
            <ul className="pj-auto-routine-items">
              {routine.items.map((item) => (
                <li key={item.suffix}>
                  <strong>{`${weekdayOptions[item.run_weekday - 1].label}`}</strong>
                  <span>período {PERIOD_PRESET_TEXT[item.period_preset].title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pj-auto-choices pj-auto-choices-compact">
              {AUTOMATION_PERIOD_PRESETS.map((preset) => (
                <label key={preset} className={`pj-auto-choice ${form.preset === preset ? "is-selected" : ""}`}>
                  <input type="radio" name="preset" value={preset} checked={form.preset === preset} onChange={() => set("preset", preset)} />
                  <span><strong>{PERIOD_PRESET_TEXT[preset].title}</strong><small>{PERIOD_PRESET_TEXT[preset].help}</small></span>
                </label>
              ))}
            </div>
          )}
          <div className="pj-auto-compare" role="radiogroup" aria-label="Comparar resultados?">
            <span className="pj-auto-legend">Comparar resultados?</span>
            <label className="pj-auto-inline">
              <input type="radio" name="comparison" checked={!form.comparison} onChange={() => set("comparison", false)} /> Não
            </label>
            <label className="pj-auto-inline">
              <input type="radio" name="comparison" checked={form.comparison} onChange={() => set("comparison", true)} /> Sim, comparar com o período equivalente anterior
            </label>
          </div>
          {previews.map((preview, index) => preview ? (
            <p className="pj-auto-period-note" key={items[index].preset + items[index].weekday}>
              {items[index].label ? <strong>{weekdayName(items[index].weekday)}: </strong> : null}
              Período: <b>{formatPeriod(preview.period.since, preview.period.until)}</b>
              {preview.period.compareSince && preview.period.compareUntil
                ? <> · Comparação: <b>{formatPeriod(preview.period.compareSince, preview.period.compareUntil)}</b></>
                : <> · Sem comparação</>}
            </p>
          ) : null)}
        </fieldset>

        <fieldset className="pj-auto-step">
          <legend>4 · Relatório detalhado</legend>
          <label className="pj-auto-inline">
            <input type="checkbox" checked={form.includeLink} onChange={(event) => set("includeLink", event.target.checked)} /> Incluir link do relatório detalhado
          </label>
          <small>Adiciona ao final da mensagem um link para o cliente visualizar métricas, gráficos e análises completas. Cada execução gera o seu próprio relatório imutável; o link de compartilhamento do dashboard não é usado.</small>
          {form.includeLink ? (
            <label>
              Texto de introdução do link
              <textarea value={form.intro} onChange={(event) => set("intro", event.target.value)} maxLength={300} rows={3} placeholder={DEFAULT_DETAILED_REPORT_INTRO} />
              <small>{form.intro.length}/300 · Deixe em branco para usar o texto padrão.</small>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="pj-auto-step">
          <legend>5 · Agendamento</legend>
          <div className="pj-auto-row">
            <label>
              Frequência
              <select value="weekly" onChange={() => undefined}>
                <option value="weekly">Semanal</option>
                <option value="biweekly" disabled>Quinzenal — em breve</option>
                <option value="monthly" disabled>Mensal — em breve</option>
              </select>
            </label>
            <label>
              Dia da semana
              {routine ? (
                <input value="Definido pela rotina" disabled readOnly />
              ) : (
                <select value={form.weekday} onChange={(event) => set("weekday", Number(event.target.value))}>
                  {weekdayOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              )}
            </label>
            <label>
              Horário
              <input type="time" value={form.time} onChange={(event) => set("time", event.target.value)} required />
            </label>
            <label>
              Fuso horário
              <select value={form.timezone} onChange={(event) => set("timezone", event.target.value)}>
                {timezones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
              </select>
            </label>
          </div>
          <div className="pj-auto-next" role="status">
            <span>Próxima execução</span>
            {previews.every(Boolean) ? (
              <ul>
                {previews.map((preview, index) => (
                  <li key={index}>
                    <strong>{formatInstant(preview!.nextRunAt, form.timezone)}</strong>
                    {items[index].label ? <small> · {weekdayName(items[index].weekday)}</small> : null}
                  </li>
                ))}
              </ul>
            ) : <strong>Informe um horário válido.</strong>}
            {!editing ? (
              <label className="pj-auto-inline">
                <input type="checkbox" checked={form.activate} onChange={(event) => set("activate", event.target.checked)} /> Ativar ao salvar
              </label>
            ) : null}
            {!editing && !form.activate ? <small>Sem ativar, a automação nasce pausada e nada é agendado até você ativá-la.</small> : null}
          </div>
        </fieldset>

        {initial ? (
          <TestSend
            clientId={clientId}
            automation={initial}
            overrides={{ ...shared, recipient: undefined, name: undefined, period_preset: form.preset, run_weekday: form.weekday }}
          />
        ) : null}

        {localError || error ? <FieldMessage error>{localError || error}</FieldMessage> : null}
        <div className="pj-auto-actions">
          <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="accent" disabled={busy || !hasDashboards}>{busy ? "Salvando…" : submitLabel}</button>
        </div>
      </div>

      <aside className="pj-auto-preview" aria-label="Prévia da mensagem">
        <span className="pj-section-label">PRÉVIA DA MENSAGEM</span>
        {previews.map((preview, index) => (
          <div key={index} className="pj-auto-preview-block">
            {items[index].label ? <h3>{weekdayOptions[items[index].weekday - 1].label} · {PERIOD_PRESET_TEXT[items[index].preset].title}</h3> : null}
            {!preview ? (
              <p className="pj-hint">Informe um horário válido para ver a prévia.</p>
            ) : preview.message.ok ? (
              <pre className="pj-auto-message">{preview.message.text}</pre>
            ) : (
              <p className="pj-hint">O dashboard escolhido não tem métricas compatíveis com este modelo. Escolha outro modelo ou dashboard.</p>
            )}
          </div>
        ))}
        <p className="pj-auto-preview-note">
          {previews.some((preview) => preview?.usedExample)
            ? "Valores de exemplo: o dashboard ainda não tem resultados importados. "
            : "Números do último resultado importado do dashboard; "}
          na execução, o período e os valores são os calculados naquele dia.
        </p>
      </aside>
    </form>
  );
}
