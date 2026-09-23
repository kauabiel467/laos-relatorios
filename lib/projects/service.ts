import type {
  AgencyData,
  AgencyRecord,
  ProjectClientAccess,
  ProjectClientInvitation,
  ProjectIfoodConnection,
  ProjectMetaConnection,
} from "@/lib/agency/types";
import { getTeamContext } from "@/lib/team/server";
import type { TeamMember, TeamRole } from "@/lib/team/types";
import { sendAuthInvitation } from "@/lib/auth-invitations";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { requireProjectSession, authorizeProject, projectAccess } from "@/lib/projects/access";
import { listProjectDocuments, preservedLegacyReports, getProjectDocument, getPreservedReport } from "@/lib/projects/documents";
import {
  projectDetailsSchema,
  type ProjectCreateInput,
  type ProjectDetailsInput,
} from "@/lib/projects/config";

export async function loadProjectWorkspace(clientId?: string, documentId?: string, legacyDocumentId?: string) {
  const session = await requireProjectSession();
  const { db, user } = session;
  const { error: invitationError } = await db.rpc("agency_accept_client_invitations");
  if (invitationError) throw Error("Não foi possível confirmar seus convites de projeto.");
  await getTeamContext(); // Accept confirmed invitations using the existing team service.
  const activeAccess = clientId ? await projectAccess(clientId, session) : null;
  let clientsQuery = db.from("agency_clients").select("*").order("name");
  let recordsQuery = db.from("agency_records").select("*").order("created_at", { ascending: false }).limit(2000);
  if (clientId) {
    clientsQuery = clientsQuery.eq("id", clientId);
    recordsQuery = recordsQuery.eq("client_id", clientId);
  }
  const [clients, records, memberships, documents] = await Promise.all([
    clientsQuery,
    recordsQuery,
    db.from("team_members").select("team_id,role").eq("user_id", user.id),
    listProjectDocuments(db, clientId),
  ]);
  if (clients.error || records.error || memberships.error) {
    throw Error("Não foi possível carregar a carteira. Tente novamente.");
  }
  const teamIds = (memberships.data ?? []).map((row) => row.team_id as string);
  const teamRoles = new Map(
    (memberships.data ?? []).map((row) => [
      row.team_id as string,
      row.role as TeamRole,
    ]),
  );
  const teams = teamIds.length ? await db.from("teams").select("id,name").in("id", teamIds) : { data: [], error: null };
  if (teams.error) throw Error("Não foi possível carregar as equipes.");
  let projectMembers: TeamMember[] = [];
  let clientAccess: ProjectClientAccess[] = [];
  let clientInvitations: ProjectClientInvitation[] = [];
  let projectMetaConnection: ProjectMetaConnection | null = null;
  let projectIfoodConnection: ProjectIfoodConnection | null = null;
  if (clientId && activeAccess?.role) {
    const [membersResult, accessResult, invitationsResult] = await Promise.all([
      db
        .from("team_members")
        .select("id,user_id,email,role,created_at")
        .eq("team_id", activeAccess.client.team_id)
        .order("created_at", { ascending: true }),
      db
        .from("agency_client_access")
        .select("client_id,user_id,email,role,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true }),
      db
        .from("agency_client_invitations")
        .select("id,client_id,email,role,status,created_at")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    if (membersResult.error || accessResult.error || invitationsResult.error) {
      throw Error("Não foi possível carregar a equipe e os acessos do projeto.");
    }
    projectMembers = (membersResult.data ?? []) as TeamMember[];
    clientAccess = (accessResult.data ?? []) as ProjectClientAccess[];
    clientInvitations = (invitationsResult.data ?? []) as ProjectClientInvitation[];

    const admin = getSupabaseAdminClient();
    if (admin) {
      const [metaResult, ifoodResult] = await Promise.all([
        admin
          .from("agency_meta_connections")
          .select(
            "account_id,account_name,account_currency,account_timezone,account_status,connection_status,connected_at,last_checked_at,last_success_at,last_error_category,last_error_message",
          )
          .eq("client_id", clientId)
          .maybeSingle(),
        admin
          .from("agency_ifood_connections")
          .select(
            "connection_status,token_expires_at,connected_at,updated_at,last_error",
          )
          .eq("client_id", clientId)
          .maybeSingle(),
      ]);
      if (metaResult.error) throw Error("Não foi possível carregar o estado da integração Meta.");
      // Keep the existing workspace available during a rolling deploy where
      // the application may start before the additive migration is applied.
      if (
        ifoodResult.error &&
        !["42P01", "PGRST205"].includes(ifoodResult.error.code)
      ) {
        throw Error("Não foi possível carregar o estado da integração iFood.");
      }
      projectMetaConnection = metaResult.data as ProjectMetaConnection | null;
      projectIfoodConnection = ifoodResult.error
        ? null
        : ifoodResult.data as ProjectIfoodConnection | null;
    }
  }
  const workspace: AgencyData = {
    clients: clients.data ?? [],
    records: (records.data ?? []) as AgencyRecord[],
    teams: teams.data ?? [],
    staffClientIds: (clients.data ?? []).filter((row) => teamIds.includes(row.team_id)).map((row) => row.id),
    projectRoles: Object.fromEntries(
      (clients.data ?? []).flatMap((row) => {
        const role = teamRoles.get(row.team_id);
        return role ? [[row.id, role]] : [];
      }),
    ),
    projectMembers,
    clientAccess,
    clientInvitations,
    projectMetaConnection,
    projectIfoodConnection,
    isStaff: teamIds.length > 0,
    userName: user.email?.split("@")[0] ?? "Minha conta",
  };
  const legacyDocuments = preservedLegacyReports(workspace.records);
  // Direct links must not become inaccessible just because a list reached its cap.
  if (clientId && documentId && !documents.some((item) => item.id === documentId && item.client_id === clientId)) {
    documents.push(await getProjectDocument(db, clientId, documentId));
  }
  if (clientId && legacyDocumentId && !legacyDocuments.some((item) => item.id === legacyDocumentId)) {
    legacyDocuments.push(await getPreservedReport(db, clientId, legacyDocumentId));
  }
  return { ...workspace, documents, legacyDocuments };
}

export async function createProject(value: ProjectCreateInput) {
  const { db, user } = await requireProjectSession();
  const { data: membership } = await db.from("team_members").select("role").eq("team_id", value.team_id).eq("user_id", user.id).maybeSingle();
  if (!membership) throw Error("Você não pertence à equipe responsável por este projeto.");
  const { data, error } = await db
    .from("agency_clients")
    .insert({
      ...value,
      contact_email: value.contact_email || null,
      logo_url: value.logo_url || null,
      onboarding_step: 2,
      onboarding_completed_at: null,
    })
    .select()
    .single();
  if (error) throw Error("Não foi possível cadastrar o projeto. Confira sua equipe e tente novamente.");
  return data;
}

export async function updateProject(
  clientId: string,
  value: ProjectDetailsInput,
) {
  const { db } = await authorizeProject(clientId);
  const { error } = await db
    .from("agency_clients")
    .update({
      ...value,
      contact_email: value.contact_email || null,
      logo_url: value.logo_url || null,
    })
    .eq("id", clientId);
  if (error) throw Error("Não foi possível salvar as preferências do projeto.");
}

export async function setProjectOnboardingStep(clientId: string, step: 2 | 3 | 4) {
  const { db, client } = await authorizeProject(clientId);
  const { error } = await db
    .from("agency_clients")
    .update({ onboarding_step: Math.max(client.onboarding_step ?? 1, step) })
    .eq("id", clientId);
  if (error) throw Error("Não foi possível salvar o progresso da configuração.");
}

export async function completeProjectSetup(clientId: string) {
  const { db, client } = await authorizeProject(clientId);
  const details = projectDetailsSchema.safeParse({
    name: client.name,
    segment: client.segment,
    unit: client.unit,
    contact_email: client.contact_email ?? "",
    logo_url: client.logo_url ?? "",
    language: client.language,
    currency: client.currency,
    date_format: client.date_format,
    decimal_separator: client.decimal_separator,
    thousands_separator: client.thousands_separator,
    timezone: client.timezone,
  });
  if (!details.success) throw Error("Revise os dados do projeto antes de concluir.");
  const admin = getSupabaseAdminClient();
  if (!admin) throw Error("Serviço de integrações indisponível.");
  const { data: connection } = await admin
    .from("agency_meta_connections")
    .select("connection_status")
    .eq("client_id", clientId)
    .maybeSingle();
  if (connection?.connection_status !== "connected") {
    throw Error("Conecte e teste uma conta antes de criar a primeira análise.");
  }
  const { error } = await db
    .from("agency_clients")
    .update({ onboarding_step: 4, onboarding_completed_at: new Date().toISOString() })
    .eq("id", clientId);
  if (error) throw Error("Não foi possível concluir a configuração do projeto.");
}

export async function inviteProjectClient(clientId: string, email: string) {
  const { db } = await authorizeProject(clientId, true);
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await db.rpc("agency_grant_access", {
    cid: clientId,
    target_email: normalizedEmail,
  });
  if (error) throw Error(error.message);
  if (data === "accepted") {
    return {
      status: "accepted" as const,
      emailSent: false,
      message: "Acesso de cliente liberado. A conta já estava confirmada.",
    };
  }
  return { status: "pending" as const, ...(await sendAuthInvitation(normalizedEmail)) };
}

export async function revokeProjectClient(clientId: string, userId: string) {
  const { db } = await authorizeProject(clientId, true);
  const { error } = await db.rpc("agency_revoke_access", {
    cid: clientId,
    target_user: userId,
  });
  if (error) throw Error("Não foi possível revogar o acesso do cliente.");
}

export async function revokeProjectInvitation(clientId: string, invitationId: string) {
  const { db } = await authorizeProject(clientId, true);
  const { error } = await db.rpc("agency_revoke_invitation", {
    cid: clientId,
    invitation_id: invitationId,
  });
  if (error) throw Error("Não foi possível cancelar o convite.");
}

export async function addProjectRecord(
  value: {
    client_id: string;
    kind: "goal" | "timeline" | "automation";
    title: string;
    visibility: "internal" | "shared";
    payload: Record<string, unknown>;
  },
) {
  const { db, user } = await authorizeProject(value.client_id);
  if (value.kind === "goal" && (!value.payload.target || !value.payload.deadline)) throw Error("Informe o valor e o prazo da meta.");
  if (value.kind === "automation" && !value.payload.cadence) throw Error("Selecione a frequência.");
  const { error } = await db.from("agency_records").insert({
    ...value,
    status: value.kind === "automation" ? "paused" : "active",
    created_by: user.id,
  });
  if (error) throw Error("Não foi possível salvar o registro.");
}

export async function updateGoalProgress(clientId: string, id: string, actual: number) {
  const { db } = await authorizeProject(clientId);
  const { data: record } = await db.from("agency_records").select("payload").eq("id", id).eq("client_id", clientId).eq("kind", "goal").maybeSingle();
  if (!record) throw Error("Meta não encontrada.");
  const { error } = await db.from("agency_records").update({ payload: { ...record.payload, actual } }).eq("id", id).eq("client_id", clientId);
  if (error) throw Error("Não foi possível atualizar a meta.");
}
