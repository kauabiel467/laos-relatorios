"use client";

import { DashboardSnapshotView } from "@/components/projects/dashboard-snapshot-view";

export function DocumentPreviewView({ clientId, documentId }: { clientId: string; documentId: string }) {
  return (
    <DashboardSnapshotView
      fetchUrl={`/api/projects/${clientId}/preview/${documentId}`}
      notFoundMessage="Não foi possível carregar esta pré-visualização."
    />
  );
}
