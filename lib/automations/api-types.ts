import type { AutomationRow, AutomationRunRow } from "./model";
import type { DeliverySummary } from "./delivery";
import type { PreviewSample } from "./preview";

// A run as the history screen receives it: with what WhatsApp reported afterwards.
export interface AutomationRunWithDelivery extends AutomationRunRow {
  delivery: DeliverySummary | null;
}

// The shape of GET /api/projects/[clientId]/automations, shared by the route and the screen.
export interface AutomationListItem extends AutomationRow {
  last_run: AutomationRunRow | null;
}

export interface DashboardOption {
  id: string;
  title: string;
  status: string;
  // Real numbers from the dashboard's last imported results, when it has any.
  sample: PreviewSample | null;
}

export interface AutomationsPayload {
  canManage: boolean;
  project: { name: string; defaultTimezone: string };
  automations: AutomationListItem[];
  dashboards: DashboardOption[];
}
