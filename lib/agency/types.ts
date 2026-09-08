import type { DashboardDataBundle } from "@/lib/types";
export interface AgencyClient {
  id: string;
  team_id: string;
  name: string;
  segment: string;
  unit: string;
  contact_email: string | null;
  meta_account_id: string | null;
  status: "active" | "paused";
  created_at: string;
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
  userName: string;
  isStaff: boolean;
}
