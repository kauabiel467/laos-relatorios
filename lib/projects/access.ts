import type { AgencyClient } from "@/lib/agency/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export class ProjectAccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403 | 404) {
    super(message);
    this.name = "ProjectAccessError";
  }
}

export async function requireProjectSession() {
  const db = await getSupabaseServerClient();
  if (!db) throw Error("Serviço indisponível.");
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new ProjectAccessError("Entre novamente para continuar.", 401);
  return { db, user };
}

// The user-scoped client is intentional: RLS decides whether the project is visible.
export async function projectAccess(cid: string, session?: Awaited<ReturnType<typeof requireProjectSession>>) {
  const { db, user } = session ?? await requireProjectSession();
  const { data: client, error } = await db
    .from("agency_clients")
    .select("*")
    .eq("id", cid)
    .maybeSingle<AgencyClient>();
  if (error || !client) throw new ProjectAccessError("Projeto não encontrado ou inacessível.", 404);
  const { data: membership, error: membershipError } = await db
    .from("team_members")
    .select("role")
    .eq("team_id", client.team_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw Error("Não foi possível verificar as permissões do projeto.");
  return { db, user, client, role: membership?.role as string | undefined };
}

export async function authorizeProject(cid: string, manage = false) {
  const access = await projectAccess(cid);
  if (!access.role) throw new ProjectAccessError("Esta ação é exclusiva da equipe do projeto.", 403);
  if (manage && !["owner", "manager"].includes(access.role)) {
    throw new ProjectAccessError("Somente proprietários e gerentes podem gerenciar este acesso.", 403);
  }
  return { ...access, role: access.role };
}
