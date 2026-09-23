"use client";

import { DashboardSnapshotView } from "@/components/projects/dashboard-snapshot-view";

export function PublicDashboardView({ token }: { token: string }) {
  return <DashboardSnapshotView fetchUrl={`/api/public/dashboards/${token}`} />;
}
