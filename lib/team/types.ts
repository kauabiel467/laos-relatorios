export type TeamRole = "owner" | "manager" | "operator";

export const teamRoleLabels: Record<TeamRole, string> = {
  owner: "Dono",
  manager: "Gerente",
  operator: "Gestor"
};

export interface TeamMember {
  id: string;
  user_id: string;
  email: string | null;
  role: TeamRole;
  created_at: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

export interface TeamContext {
  team: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  currentRole: TeamRole | null;
  members: TeamMember[];
  invitations: TeamInvitation[];
}
