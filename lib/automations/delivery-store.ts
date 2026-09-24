import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeDelivery, type DeliveryEvent, type DeliverySummary } from "./delivery";
import type { ParsedDeliveryStatus } from "@/lib/whatsapp/webhook";

// Stores delivery statuses reported by WhatsApp. Written with the service role
// (the webhook has no user); read with the caller's own client, so RLS decides
// who may see a project's deliveries.

// Links each status to the run that sent that message and stores it once.
// Statuses for messages this app did not send (or no longer knows) are dropped.
export async function recordDeliveryStatuses(admin: SupabaseClient, statuses: ParsedDeliveryStatus[]) {
  if (!statuses.length) return { received: 0, stored: 0 };
  const ids = Array.from(new Set(statuses.map((item) => item.providerMessageId)));
  const { data: runs, error } = await admin
    .from("agency_report_automation_runs")
    .select("id,client_id,provider_message_id")
    .in("provider_message_id", ids);
  if (error) throw Error("Não foi possível localizar as execuções dos status recebidos.");
  const byMessage = new Map((runs ?? []).map((run) => [run.provider_message_id as string, run as { id: string; client_id: string }]));
  const rows = statuses.flatMap((item) => {
    const run = byMessage.get(item.providerMessageId);
    if (!run) return [];
    return [{
      run_id: run.id,
      client_id: run.client_id,
      provider_message_id: item.providerMessageId,
      status: item.status,
      occurred_at: item.occurredAt,
      error_code: item.errorCode,
      error_message: item.errorMessage,
    }];
  });
  if (!rows.length) return { received: statuses.length, stored: 0 };
  const { error: insertError } = await admin
    .from("agency_report_automation_delivery_events")
    .upsert(rows, { onConflict: "provider_message_id,status", ignoreDuplicates: true });
  if (insertError) throw Error("Não foi possível registrar o status de entrega.");
  return { received: statuses.length, stored: rows.length };
}

// The delivery outcome of each run, keyed by run id.
export async function listDeliverySummaries(db: SupabaseClient, runIds: string[]) {
  const summaries = new Map<string, DeliverySummary>();
  if (!runIds.length) return summaries;
  const { data, error } = await db
    .from("agency_report_automation_delivery_events")
    .select("run_id,status,occurred_at,error_code,error_message")
    .in("run_id", runIds);
  if (error) return summaries; // Delivery detail is a bonus; the history must still load.
  const grouped = new Map<string, DeliveryEvent[]>();
  for (const row of data ?? []) {
    const list = grouped.get(row.run_id as string) ?? [];
    list.push(row as unknown as DeliveryEvent);
    grouped.set(row.run_id as string, list);
  }
  for (const [runId, events] of grouped) {
    const summary = summarizeDelivery(events);
    if (summary) summaries.set(runId, summary);
  }
  return summaries;
}
