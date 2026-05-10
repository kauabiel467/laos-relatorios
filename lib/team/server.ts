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

function canManage(role: TeamRole | null) {
  return role === "owner" || role === "manager";
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
  const user = await getCurrentUser();

  if (!supabase || !user) {
    throw new Error("Voce precisa estar logado para criar uma equipe.");
  }

  const { data: team, error: teamError } = await supabase.from("teams").insert({ name, created_by: user.id }).select("id").single();
  if (teamError) throw teamError;

  const { error: memberError } = await supabase.from("team_members").insert({
    team_id: team.id,
    user_id: user.id,
    email: user.email,
    role: "owner"
  });
  if (memberError) throw memberError;

  return team.id as string;
}

export async function inviteTeamMember(email: string, role: TeamRole) {
  const context = await getTeamContext();
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();

  if (!supabase || !context.team || !canManage(context.currentRole)) {
    throw new Error("Voce nao tem permissao para convidar membros.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.from("team_invitations").insert({
    team_id: context.team.id,
    email: normalizedEmail,
    role,
    invited_by: (await getCurrentUser())?.id
  });
  if (error) throw error;

  if (admin) {
    await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback`
    });
  }
}
