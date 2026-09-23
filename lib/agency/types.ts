import type { DashboardDataBundle } from "@/lib/types";
import type { TeamMember, TeamRole } from "@/lib/team/types";
export interface AgencyClient {
  id: string;
  team_id: string;
  name: string;
  segment: string;
  unit: string;
  contact_email: string | null;
  logo_url?: string;
  meta_connected_at?: string;
  meta_account_id: string | null;
  language: "pt-BR" | "en-US" | "es-ES";
  currency: "BRL" | "USD" | "EUR" | "ARS" | "MXN";
  date_format: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  decimal_separator: "," | ".";
  thousands_separator: "." | ",";
  timezone: string;
  onboarding_step: 1 | 2 | 3 | 4;
  onboarding_completed_at: string | null;
  status: "active" | "paused";
  created_at: string;
}

export interface ProjectClientAccess {
  client_id: string;
  user_id: string;
  email: string | null;
  role: "viewer";
  created_at: string;
}

export interface ProjectClientInvitation {
  id: string;
  client_id: string;
  email: string;
  role: "viewer";
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

export type ProjectMetaConnectionStatus =
  | "untested"
  | "connected"
  | "reauth_required"
  | "temporarily_unavailable"
  | "error";

export interface ProjectMetaConnection {
  account_id: string;
  account_name: string | null;
  account_currency: string | null;
  account_timezone: string | null;
  account_status: string | null;
  connection_status: ProjectMetaConnectionStatus;
  connected_at: string;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error_category: string | null;
  last_error_message: string | null;
}
export interface ProjectIfoodConnection {
  connection_status: "connected" | "error";
  token_expires_at: string | null;
  connected_at: string | null;
  updated_at: string;
  last_error: string | null;
}
export interface AgencyRecord {
  id: string;
  client_id: string;
  kind: "goal" | "timeline" | "report" | "snapshot" | "automation";
  title: string;
  payload: {
    description?: string;
    metric?: string;
    target?: number;
    actual?: number;
    direction?: "above" | "below";
    deadline?: string;
    source?: string;
    period?: string;
    bundle?: DashboardDataBundle;
    cadence?: string;
    next_run?: string;
    [key: string]: unknown;
  };
  visibility: "internal" | "shared";
  status: string;
  created_at: string;
}
export interface AgencyData {
  clients: AgencyClient[];
  records: AgencyRecord[];
  teams: { id: string; name: string }[];
  staffClientIds: string[];
  projectRoles: Record<string, TeamRole>;
  projectMembers: TeamMember[];
  clientAccess: ProjectClientAccess[];
  clientInvitations: ProjectClientInvitation[];
  projectMetaConnection: ProjectMetaConnection | null;
  projectIfoodConnection: ProjectIfoodConnection | null;
  userName: string;
  isStaff: boolean;
}
