import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationInput, AutomationRow, AutomationRunRow, AutomationStatus } from "./model";
import { nextRunAt } from "./schedule";

// Reads and writes automations with the caller's own (RLS-scoped) client, so the
// database decides who may see or change what. Runs are read-only here: only the
// backend engine writes them, with the service role.

export const AUTOMATION_COLUMNS =
  "id,client_id,document_id,name,routine_key,message_template,period_preset,comparison_enabled,include_detailed_report,detailed_report_intro,frequency,run_weekday,run_time,timezone,channel,recipient,status,created_by,created_at,updated_at,last_run_at,next_run_at";

// report_snapshot is left out of listings: it can be large and the history view
// only needs to know a run has one (report_share_token is set when it does).
export const AUTOMATION_RUN_COLUMNS =
  "id,automation_id,client_id,attempt,scheduled_for,status,started_at,finished_at,timezone,period_preset,period_since,period_until,compare_since,compare_until,message_template,message_text,error_code,error_message,provider_message_id,trigger_type,parent_run_id,recipient_label,provider,provider_status,retryable,retry_after,report_share_token,created_at,updated_at";

// next_run_at only means something while an automation is active.
export function computeNextRunAt(
  automation: Pick<AutomationInput, "status" | "run_weekday" | "run_time" | "timezone">,
  now: Date = new Date(),
) {
  if (automation.status !== "active") return null;
  return nextRunAt(
    { runWeekday: automation.run_weekday as 1, runTime: automation.run_time, timezone: automation.timezone },
    now,
  ).toISOString();
}

function friendlyError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "23505") return "Já existe uma automação com esse nome neste projeto.";
  if (error.code === "23503") return "O dashboard escolhido não pertence a este projeto.";
  if (error.code === "42501") return "Você não tem permissão para gerenciar automações deste projeto.";
  // Trigger messages are written for people (pt-BR) and safe to show.
  if (error.code === "P0001" && error.message) return error.message;
  return fallback;
}

export async function listAutomations(db: SupabaseClient, clientId: string) {
  const { data, error } = await db
    .from("agency_report_automations")
    .select(AUTOMATION_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw Error("Não foi possível carregar as automações.");
  return (data ?? []) as unknown as AutomationRow[];
}

export async function createAutomation(
  db: SupabaseClient,
  clientId: string,
  actorId: string,
  input: AutomationInput,
  now: Date = new Date(),
) {
  const { data, error } = await db
    .from("agency_report_automations")
    .insert({
      client_id: clientId,
      created_by: actorId,
      ...input,
      routine_key: input.routine_key ?? null,
      next_run_at: computeNextRunAt(input, now),
    })
    .select(AUTOMATION_COLUMNS)
    .single();
  if (error) throw Error(friendlyError(error, "Não foi possível criar a automação."));
  return data as unknown as AutomationRow;
}

// Several automations in ONE statement, so a routine is created whole or not at all.
export async function createAutomations(
  db: SupabaseClient,
  clientId: string,
  actorId: string,
  inputs: AutomationInput[],
  now: Date = new Date(),
) {
  const { data, error } = await db
    .from("agency_report_automations")
    .insert(
      inputs.map((input) => ({
        client_id: clientId,
        created_by: actorId,
        ...input,
        routine_key: input.routine_key ?? null,
        next_run_at: computeNextRunAt(input, now),
      })),
    )
    .select(AUTOMATION_COLUMNS);
  if (error) throw Error(friendlyError(error, "Não foi possível criar as automações."));
  return (data ?? []) as unknown as AutomationRow[];
}

export async function deleteAutomation(db: SupabaseClient, automation: Pick<AutomationRow, "id" | "client_id">) {
  const { error } = await db
    .from("agency_report_automations")
    .delete()
    .eq("id", automation.id)
    .eq("client_id", automation.client_id);
  if (!error) return;
  // Runs keep their automation alive on purpose: history is never orphaned.
  if (error.code === "23503") throw Error("Esta automação já tem histórico de execuções. Pause-a em vez de excluir.");
  throw Error(friendlyError(error, "Não foi possível excluir a automação."));
}

// Most recent run of each automation of a project (the list shows "Última: enviado").
export async function listLatestRuns(db: SupabaseClient, clientId: string) {
  const { data, error } = await db
    .from("agency_report_automation_runs")
    .select(AUTOMATION_RUN_COLUMNS)
    .eq("client_id", clientId)
    .order("scheduled_for", { ascending: false })
    .limit(500);
  if (error) throw Error("Não foi possível carregar as execuções.");
  const latest = new Map<string, AutomationRunRow>();
  for (const run of (data ?? []) as unknown as AutomationRunRow[]) {
    if (!latest.has(run.automation_id)) latest.set(run.automation_id, run);
  }
  return latest;
}

export async function updateAutomation(
  db: SupabaseClient,
  existing: AutomationRow,
  patch: Partial<AutomationInput>,
  now: Date = new Date(),
) {
  const merged = { ...existing, ...patch };
  const { data, error } = await db
    .from("agency_report_automations")
    .update({ ...patch, next_run_at: computeNextRunAt(merged, now) })
    .eq("id", existing.id)
    .eq("client_id", existing.client_id)
    .select(AUTOMATION_COLUMNS)
    .single();
  if (error) throw Error(friendlyError(error, "Não foi possível salvar a automação."));
  return data as unknown as AutomationRow;
}

export function setAutomationStatus(
  db: SupabaseClient,
  automation: AutomationRow,
  status: AutomationStatus,
  now: Date = new Date(),
) {
  return updateAutomation(db, automation, { status }, now);
}

export async function listAutomationRuns(db: SupabaseClient, automationId: string, limit = 30) {
  const { data, error } = await db
    .from("agency_report_automation_runs")
    .select(AUTOMATION_RUN_COLUMNS)
    .eq("automation_id", automationId)
    .order("scheduled_for", { ascending: false })
    .limit(limit);
  if (error) throw Error("Não foi possível carregar o histórico da automação.");
  return (data ?? []) as unknown as AutomationRunRow[];
}
