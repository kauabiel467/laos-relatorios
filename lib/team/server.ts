import { env } from "@/lib/env";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import type { TeamContext, TeamRole } from "./types";

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  email: string | null;
  role: TeamRole;
  created_at: string;
};

type TeamInvitationRow = {
  id: string;
  team_id: string;
  email: string;
  role: TeamRole;
};

type SupabaseLikeError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

function canManage(role: TeamRole | null) {
  return role === "owner" || role === "manager";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof (error as SupabaseLikeError).message === "string") {
    return (error as SupabaseLikeError).message as string;
  }

  return fallback;
}

function normalizeTeamError(error: unknown) {
  const message = getErrorMessage(error, "Nao foi possivel concluir a operacao.");
  const normalized = message.toLowerCase();

  if (normalized.includes("permission denied")) {
    return "O Supabase bloqueou o acesso as tabelas da equipe. Falta liberar a Data API para teams, team_members e team_invitations ou aplicar a migration com os GRANTs.";
  }

  if (normalized.includes("row-level security")) {
    return "O Supabase bloqueou a criacao pela policy de seguranca. Verifique se a migration das equipes foi aplicada por completo no banco.";
  }

  if (normalized.includes("could not find the table") || normalized.includes("relation") && normalized.includes("does not exist")) {
    return "As tabelas de equipe ainda nao existem nesse projeto Supabase. A migration de auth/equipes precisa ser aplicada no banco de producao.";
  }

  return message;
}

function normalizeEmailProviderError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "O Supabase atingiu o limite do provedor de e-mail. O convite ficou salvo, mas para enviar e-mails em producao voce precisa configurar um SMTP proprio no projeto.";
  }

  if (normalized.includes("email address not authorized")) {
    return "O convite ficou salvo, mas o e-mail nao foi disparado. O SMTP padrao do Supabase so envia para enderecos autorizados da equipe do projeto.";
  }

  return message;
}

function canRemoveActor(currentRole: TeamRole | null, targetRole: TeamRole, isSelf: boolean) {
  if (isSelf) return false;
  if (currentRole === "owner") return true;
  if (currentRole === "manager") return targetRole === "operator";
  return false;
}

export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}

async function acceptPendingInvitations() {
  const admin = getSupabaseAdminClient();
  const user = await getCurrentUser();
  const email = user?.email?.trim().toLowerCase();

  if (!admin || !user || !email) {
    return;
  }

  const { data: invitations } = await admin
    .from("team_invitations")
    .select("id, team_id, email, role")
    .eq("email", email)
    .eq("status", "pending")
    .returns<TeamInvitationRow[]>();

  for (const invite of invitations ?? []) {
    await admin.from("team_members").upsert(
      {
        team_id: invite.team_id,
        user_id: user.id,
        email,
        role: invite.role
      },
      { onConflict: "team_id,user_id" }
    );

    await admin
      .from("team_invitations")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString()
      })
      .eq("id", invite.id);
  }
}

export async function getTeamContext(): Promise<TeamContext> {
  const supabase = await getSupabaseServerClient();
  const user = await getCurrentUser();

  if (!supabase || !user) {
    return { team: null, currentRole: null, members: [], invitations: [] };
  }

  await acceptPendingInvitations();

  const { data: membership } = await supabase
    .from("team_members")
    .select("id, team_id, user_id, email, role, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<TeamMemberRow>();

  if (!membership) {
    return { team: null, currentRole: null, members: [], invitations: [] };
  }

  const [{ data: team }, { data: members }, { data: invitations }] = await Promise.all([
    supabase.from("teams").select("id, name, created_at").eq("id", membership.team_id).maybeSingle(),
    supabase
      .from("team_members")
      .select("id, user_id, email, role, created_at")
      .eq("team_id", membership.team_id)
      .order("created_at", { ascending: true }),
    canManage(membership.role)
      ? supabase
          .from("team_invitations")
          .select("id, email, role, status, created_at")
          .eq("team_id", membership.team_id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] })
  ]);

  return {
    team: team ?? null,
    currentRole: membership.role,
    members: (members ?? []) as TeamContext["members"],
    invitations: (invitations ?? []) as TeamContext["invitations"]
  };
}

export async function createTeam(name: string) {
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  const user = await getCurrentUser();

  if (!supabase || !user) {
    throw new Error("Voce precisa estar logado para criar uma equipe.");
  }

  const currentUser = user;

  async function insertWithClient(client: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>> | NonNullable<ReturnType<typeof getSupabaseAdminClient>>) {
    const { data: team, error: teamError } = await client
      .from("teams")
      .insert({ name, created_by: currentUser.id })
      .select("id")
      .single();

    if (teamError) {
      throw teamError;
    }

    const { error: memberError } = await client.from("team_members").insert({
      team_id: team.id,
      user_id: currentUser.id,
      email: currentUser.email,
      role: "owner"
    });

    if (memberError) {
      throw memberError;
    }

    return team.id as string;
  }

  try {
    return await insertWithClient(supabase);
  } catch (error) {
    if (admin) {
      try {
        return await insertWithClient(admin);
      } catch (adminError) {
        throw new Error(normalizeTeamError(adminError));
      }
    }

    throw new Error(normalizeTeamError(error));
  }
}

export async function inviteTeamMember(email: string, role: TeamRole) {
  const context = await getTeamContext();
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  const user = await getCurrentUser();

  if (!supabase || !context.team || !canManage(context.currentRole)) {
    throw new Error("Voce nao tem permissao para convidar membros.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.from("team_invitations").upsert({
    team_id: context.team.id,
    email: normalizedEmail,
    role,
    invited_by: user?.id,
    status: "pending"
  }, { onConflict: "team_id,email,status" });
  if (error) throw error;

  if (!admin) {
    return {
      emailSent: false,
      message:
        "Convite salvo. Para disparar o e-mail automaticamente, configure SUPABASE_SECRET_KEY no app e um SMTP proprio no Supabase Auth."
    };
  }

  try {
    await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`
    });

    return {
      emailSent: true,
      message: "Convite enviado por e-mail."
    };
  } catch (error) {
    const message = error instanceof Error ? normalizeEmailProviderError(error.message) : "Convite salvo, mas nao foi possivel enviar o e-mail agora.";

    return {
      emailSent: false,
      message
    };
  }
}

export async function removeTeamMember(memberId: string) {
  const context = await getTeamContext();
  const admin = getSupabaseAdminClient();
  const user = await getCurrentUser();

  if (!admin || !context.team || !user) {
    throw new Error("Voce precisa estar logado.");
  }

  const target = context.members.find((member) => member.id === memberId);
  if (!target) {
    throw new Error("Membro nao encontrado.");
  }

  if (!canRemoveActor(context.currentRole, target.role, target.user_id === user.id)) {
    throw new Error("Voce nao tem permissao para remover este membro.");
  }

  const { error } = await admin.from("team_members").delete().eq("id", memberId).eq("team_id", context.team.id);
  if (error) throw error;
}
