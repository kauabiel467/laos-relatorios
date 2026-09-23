import { z } from "zod";
import { getSupabasePublicClient } from "@/lib/supabase/server";
import { authorizeProject, ProjectAccessError } from "@/lib/projects/access";
import { getProjectDocument } from "@/lib/projects/documents";
import { normalizeAnalysisConfig, type AnalysisConfig, type AnalysisData } from "@/lib/projects/model";

// Exactly what the client-facing page renders. No ids, status, tokens,
// integration data, team members or anything from the admin workspace.
export type ClientReport = {
  title: string;
  config: AnalysisConfig;
  data: AnalysisData;
  updatedAt: string;
  clientName: string;
  clientLogoUrl: string | null;
};

type PublicReportRow = {
  title: string;
  config: AnalysisConfig;
  data: AnalysisData;
  updated_at: string;
  client_name: string;
  client_logo_url: string | null;
};

// Resolves a share token to the last PUBLISHED version of a dashboard. A wrong
// token, a deactivated link and a dashboard that was restricted again all
// return null, so callers cannot tell them apart. One row-limited RPC call and
// nothing else: it never loads the workspace.
export async function loadPublishedReportByToken(token: string): Promise<ClientReport | null> {
  const parsed = z.string().uuid().safeParse(token);
  if (!parsed.success) return null;
  const db = getSupabasePublicClient();
  if (!db) return null;
  const { data, error } = await db
    .rpc("get_public_dashboard", { p_token: parsed.data })
    .maybeSingle<PublicReportRow>();
  if (error || !data?.config || !data.data) return null;
  return {
    title: data.title,
    config: normalizeAnalysisConfig(data.config),
    data: data.data,
    updatedAt: data.updated_at,
    clientName: data.client_name,
    clientLogoUrl: data.client_logo_url,
  };
}

// The manager's private "ver como cliente": the CURRENT saved version, gated by
// the normal project access check. It creates no share token and exposes
// nothing publicly, so a draft stays private.
export async function loadReportPreview(clientId: string, documentId: string): Promise<ClientReport> {
  const ids = z.object({ clientId: z.string().uuid(), documentId: z.string().uuid() }).safeParse({ clientId, documentId });
  if (!ids.success) throw new ProjectAccessError("Documento não encontrado ou inacessível.", 404);
  const { db, client } = await authorizeProject(ids.data.clientId);
  const document = await getProjectDocument(db, ids.data.clientId, ids.data.documentId);
  if (document.kind !== "dashboard") {
    throw new ProjectAccessError("Apenas dashboards têm esta pré-visualização.", 404);
  }
  if (!document.data) {
    throw new ProjectAccessError("Atualize os dados do dashboard antes de visualizar como cliente.", 404);
  }
  return {
    title: document.title,
    config: normalizeAnalysisConfig(document.config),
    data: document.data,
    updatedAt: document.updated_at,
    clientName: client.name,
    clientLogoUrl: client.logo_url ?? null,
  };
}
