import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyRecord } from "@/lib/agency/types";
import { normalizeAnalysisConfig, type AnalysisConfig, type ProjectDocument } from "@/lib/projects/model";
import { collectAnalysis } from "@/lib/projects/meta";
import { ProjectAccessError } from "@/lib/projects/access";

export async function listProjectDocuments(db: SupabaseClient, clientId?: string) {
  let query = db
    .from("agency_documents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  // Include reusable templates, but never another project's result documents.
  if (clientId) query = query.or(`client_id.eq.${clientId},kind.eq.template`);
  const { data, error } = await query;
  if (error) throw Error("Não foi possível carregar os documentos.");
  return (data ?? []) as ProjectDocument[];
}

export async function getProjectDocument(db: SupabaseClient, clientId: string, id: string) {
  const { data, error } = await db
    .from("agency_documents")
    .select("*")
    .eq("id", id)
    .eq("client_id", clientId)
    .maybeSingle<ProjectDocument>();
  if (error || !data) throw new ProjectAccessError("Documento não encontrado ou inacessível.", 404);
  return data;
}

// Historical record reports have a different snapshot shape. They are read-only
// documents, never reinterpreted as current Meta insights or silently migrated.
export function preservedLegacyReports(records: AgencyRecord[]) {
  return records.filter((record) => record.kind === "report");
}

export async function getPreservedReport(db: SupabaseClient, clientId: string, id: string) {
  const { data, error } = await db.from("agency_records").select("*").eq("id", id).eq("client_id", clientId).eq("kind", "report").maybeSingle<AgencyRecord>();
  if (error || !data) throw new ProjectAccessError("Relatório histórico não encontrado ou inacessível.", 404);
  return data;
}

export async function copyProjectDocument(
  db: SupabaseClient,
  document: ProjectDocument,
  actorId: string,
  action: "duplicate" | "convert" | "template",
) {
  const kind = action === "convert" ? "report" : action === "template" ? "template" : document.kind;
  const prefix = action === "template" ? "Modelo · " : action === "duplicate" ? "Cópia · " : "Relatório · ";
  const { data, error } = await db
    .from("agency_documents")
    .insert({
      client_id: document.client_id,
      kind,
      title: prefix + document.title.slice(0, 145),
      config: document.config,
      data: kind === "template" ? null : document.data,
      created_by: actorId,
    })
    .select()
    .single();
  if (error) throw Error("Não foi possível criar a cópia.");
  return data as ProjectDocument;
}

export async function deleteProjectDocument(db: SupabaseClient, document: ProjectDocument | null) {
  if (!document || document.status !== "draft") throw Error("Apenas rascunhos podem ser excluídos.");
  const { error } = await db.from("agency_documents").delete().eq("id", document.id).eq("client_id", document.client_id);
  if (error) throw Error("Não foi possível excluir.");
}

export async function setProjectDocumentPublication(
  db: SupabaseClient,
  document: ProjectDocument | null,
  published: boolean,
) {
  if (published && (!document?.data || document.kind === "template")) throw Error("Importe os resultados antes de publicar.");
  if (!published && (!document || document.kind !== "dashboard")) throw Error("Relatórios publicados permanecem preservados.");
  if (!document) throw Error("Documento não encontrado.");
  const { data, error } = await db.from("agency_documents").update({ status: published ? "published" : "draft" }).eq("id", document.id).eq("client_id", document.client_id).select().single();
  if (error) throw Error(published ? "Não foi possível publicar." : "Não foi possível restringir o acesso.");
  return data as ProjectDocument;
}

export async function saveProjectDocument(
  db: SupabaseClient,
  clientId: string,
  actorId: string,
  input: {
    action: "create" | "save" | "refresh";
    title: string;
    config: AnalysisConfig;
    kind: ProjectDocument["kind"];
  },
  existing: ProjectDocument | null,
) {
  if (existing?.kind === "report" && existing.status === "published") throw Error("Duplique o relatório publicado para criar uma nova versão.");
  const { config, title, kind } = input;
  // Changing the query invalidates the snapshot; historical data is never relabeled.
  const queryIdentity = (value: AnalysisConfig) => JSON.stringify([
    value.since, value.until, value.comparison, value.compare_since,
    value.compare_until, value.campaign_ids, normalizeAnalysisConfig(value).primary_metric,
  ]);
  const changed = existing && queryIdentity(config) !== queryIdentity(existing.config);
  const data = kind === "template"
    ? null
    : input.action === "refresh" || input.action === "create"
      ? await collectAnalysis(clientId, config)
      : changed ? null : existing?.data;
  const value = { title, config, data, ...(changed && input.action === "save" ? { status: "draft" } : {}) };
  const result = existing
    ? await db.from("agency_documents").update(value).eq("id", existing.id).eq("client_id", clientId).select().single()
    : await db.from("agency_documents").insert({ ...value, client_id: clientId, kind, created_by: actorId }).select().single();
  if (result.error) throw Error("Não foi possível salvar o documento.");
  return result.data as ProjectDocument;
}
