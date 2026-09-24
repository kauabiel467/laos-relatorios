import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisConfig } from "@/lib/projects/model";
import type { AutomationRow, AutomationRunRow, AutomationRunTrigger } from "./model";
import { AUTOMATION_COLUMNS } from "./store";

// Everything the executor needs from the database, behind one interface. The
// real implementation uses the service role (run history is backend-written
// only); tests plug in an in-memory one that enforces the same rules.

export interface NewRun {
  automation_id: string;
  client_id: string;
  attempt: number;
  scheduled_for: string;
  trigger_type: AutomationRunTrigger;
  parent_run_id: string | null;
  requested_by: string | null;
  idempotency_key: string;
  recipient_label: string | null;
  provider: string | null;
  timezone: string;
  period_preset: AutomationRunRow["period_preset"];
  period_since: string;
  period_until: string;
  compare_since: string | null;
  compare_until: string | null;
  message_template: AutomationRunRow["message_template"];
}

export interface RunProgress {
  message_text?: string;
  report_snapshot?: unknown;
  report_share_token?: string;
  provider_status?: string;
  provider_message_id?: string;
}

export interface RunFinish extends Omit<RunProgress, "provider_message_id"> {
  provider_message_id?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  retryable?: boolean;
  retry_after?: string | null;
}

export interface DashboardSource {
  title: string;
  kind: string;
  config: AnalysisConfig;
}

export interface RunStore {
  // Creates the run, or returns null when its slot/idempotency key already exists
  // (another worker, a repeated cron call or a double click got there first).
  insertRun(record: NewRun): Promise<AutomationRunRow | null>;
  // scheduled -> running, atomically: exactly one caller gets the row back.
  claimRun(runId: string, at: Date): Promise<AutomationRunRow | null>;
  // Saves what a running run has built so far (message, frozen report, ...).
  saveProgress(runId: string, progress: RunProgress): Promise<void>;
  // running/scheduled -> sent | failed | skipped, once.
  finishRun(runId: string, status: "sent" | "failed" | "skipped", finish: RunFinish, at: Date): Promise<AutomationRunRow | null>;
  getRun(runId: string): Promise<AutomationRunRow | null>;
  loadAutomation(automationId: string): Promise<AutomationRow | null>;
  loadDashboard(clientId: string, documentId: string): Promise<DashboardSource | null>;
  loadClientName(clientId: string): Promise<string | null>;
  // Moves next_run_at only if it still holds the value this worker read, so an
  // edit made meanwhile (or another worker) is never overwritten.
  advanceNextRun(automationId: string, expected: string | null, next: string | null): Promise<boolean>;
  markRan(automationId: string, at: Date): Promise<void>;
  listDue(now: Date, limit: number): Promise<AutomationRow[]>;
  listOpenRunsBefore(cutoff: Date): Promise<AutomationRunRow[]>;
  hasOpenRunAfter(automationId: string, cutoff: Date): Promise<boolean>;
  listRetryable(now: Date, maxAttempts: number, limit: number): Promise<AutomationRunRow[]>;
}

const RUN_COLUMNS =
  "id,automation_id,client_id,attempt,scheduled_for,status,started_at,finished_at,timezone,period_preset,period_since,period_until,compare_since,compare_until,message_template,message_text,error_code,error_message,provider_message_id,trigger_type,parent_run_id,requested_by,idempotency_key,recipient_label,provider,provider_status,retryable,retry_after,report_share_token,created_at,updated_at";

export class SupabaseRunStore implements RunStore {
  constructor(private readonly db: SupabaseClient) {}

  async insertRun(record: NewRun) {
    const { data, error } = await this.db.from("agency_report_automation_runs").insert(record).select(RUN_COLUMNS).single();
    if (error) {
      // 23505 = slot or idempotency key already taken: someone else owns this run.
      if (error.code === "23505") return null;
      throw Error(`Não foi possível registrar a execução (${error.code ?? "erro"}).`);
    }
    return data as unknown as AutomationRunRow;
  }

  async claimRun(runId: string, at: Date) {
    const { data, error } = await this.db
      .from("agency_report_automation_runs")
      .update({ status: "running", started_at: at.toISOString() })
      .eq("id", runId)
      .eq("status", "scheduled")
      .select(RUN_COLUMNS)
      .maybeSingle();
    if (error) throw Error("Não foi possível iniciar a execução.");
    return (data as unknown as AutomationRunRow | null) ?? null;
  }

  async saveProgress(runId: string, progress: RunProgress) {
    const { error } = await this.db
      .from("agency_report_automation_runs")
      .update(progress)
      .eq("id", runId)
      .in("status", ["scheduled", "running"]);
    if (error) throw Error("Não foi possível salvar o andamento da execução.");
  }

  async finishRun(runId: string, status: "sent" | "failed" | "skipped", finish: RunFinish, at: Date) {
    const { data, error } = await this.db
      .from("agency_report_automation_runs")
      .update({ ...finish, status, finished_at: at.toISOString() })
      .eq("id", runId)
      .in("status", ["scheduled", "running"])
      .select(RUN_COLUMNS)
      .maybeSingle();
    if (error) throw Error("Não foi possível registrar o resultado da execução.");
    return (data as unknown as AutomationRunRow | null) ?? null;
  }

  async getRun(runId: string) {
    const { data } = await this.db.from("agency_report_automation_runs").select(RUN_COLUMNS).eq("id", runId).maybeSingle();
    return (data as unknown as AutomationRunRow | null) ?? null;
  }

  async loadAutomation(automationId: string) {
    const { data } = await this.db.from("agency_report_automations").select(AUTOMATION_COLUMNS).eq("id", automationId).maybeSingle();
    return (data as unknown as AutomationRow | null) ?? null;
  }

  async loadDashboard(clientId: string, documentId: string) {
    const { data } = await this.db
      .from("agency_documents")
      .select("title,kind,config")
      .eq("id", documentId)
      .eq("client_id", clientId)
      .maybeSingle();
    return (data as unknown as DashboardSource | null) ?? null;
  }

  async loadClientName(clientId: string) {
    const { data } = await this.db.from("agency_clients").select("name").eq("id", clientId).maybeSingle();
    return (data as { name?: string } | null)?.name ?? null;
  }

  async advanceNextRun(automationId: string, expected: string | null, next: string | null) {
    let query = this.db.from("agency_report_automations").update({ next_run_at: next }).eq("id", automationId);
    query = expected === null ? query.is("next_run_at", null) : query.eq("next_run_at", expected);
    const { data, error } = await query.select("id");
    if (error) throw Error("Não foi possível reagendar a automação.");
    return (data ?? []).length > 0;
  }

  async markRan(automationId: string, at: Date) {
    await this.db.from("agency_report_automations").update({ last_run_at: at.toISOString() }).eq("id", automationId);
  }

  async listDue(now: Date, limit: number) {
    const { data, error } = await this.db
      .from("agency_report_automations")
      .select(AUTOMATION_COLUMNS)
      .eq("status", "active")
      .not("next_run_at", "is", null)
      .lte("next_run_at", now.toISOString())
      .order("next_run_at", { ascending: true })
      .limit(limit);
    if (error) throw Error("Não foi possível consultar as automações vencidas.");
    return (data ?? []) as unknown as AutomationRow[];
  }

  async listOpenRunsBefore(cutoff: Date) {
    const { data, error } = await this.db
      .from("agency_report_automation_runs")
      .select(RUN_COLUMNS)
      .in("status", ["scheduled", "running"])
      .lt("created_at", cutoff.toISOString())
      .limit(50);
    if (error) throw Error("Não foi possível consultar execuções em aberto.");
    return (data ?? []) as unknown as AutomationRunRow[];
  }

  async hasOpenRunAfter(automationId: string, cutoff: Date) {
    const { data } = await this.db
      .from("agency_report_automation_runs")
      .select("id")
      .eq("automation_id", automationId)
      .in("status", ["scheduled", "running"])
      .gte("created_at", cutoff.toISOString())
      .limit(1);
    return (data ?? []).length > 0;
  }

  async listRetryable(now: Date, maxAttempts: number, limit: number) {
    const { data, error } = await this.db
      .from("agency_report_automation_runs")
      .select(RUN_COLUMNS)
      .eq("status", "failed")
      .eq("retryable", true)
      .lte("retry_after", now.toISOString())
      .lt("attempt", maxAttempts)
      .order("retry_after", { ascending: true })
      .limit(limit * 3);
    if (error) throw Error("Não foi possível consultar as tentativas pendentes.");
    const candidates = (data ?? []) as unknown as AutomationRunRow[];
    if (!candidates.length) return [];
    // A failed run that was already retried has a child; only childless ones are due.
    const { data: children } = await this.db
      .from("agency_report_automation_runs")
      .select("parent_run_id")
      .in("parent_run_id", candidates.map((run) => run.id));
    const retried = new Set((children ?? []).map((row) => (row as { parent_run_id: string }).parent_run_id));
    return candidates.filter((run) => !retried.has(run.id)).slice(0, limit);
  }
}
