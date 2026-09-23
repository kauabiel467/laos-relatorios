import type { AnalysisConfig, AnalysisData, ProjectDocument } from "@/lib/projects/model";

type PublicationFields = Pick<ProjectDocument, "kind" | "published_at" | "content_hash" | "published_hash">;

// A dashboard has a published version once it has been published at least once
// and not restricted since. That version (not the live row) is what the public
// link serves.
export function hasPublishedVersion(doc: Pick<ProjectDocument, "kind" | "published_at">) {
  return doc.kind === "dashboard" && Boolean(doc.published_at);
}

// True when the saved content differs from the last published snapshot, i.e.
// the public link is showing an older version than the editor.
export function hasUnpublishedChanges(doc: PublicationFields) {
  return (
    hasPublishedVersion(doc) &&
    doc.published_hash != null &&
    doc.content_hash != null &&
    doc.published_hash !== doc.content_hash
  );
}

export const publicReportPath = (token: string) => `/report/${encodeURIComponent(token)}`;

export const clientPreviewPath = (clientId: string, documentId: string) =>
  `/projects/${encodeURIComponent(clientId)}/preview/${encodeURIComponent(documentId)}`;

// The period a report covers: what the data was actually collected for, falling
// back to the configured dates. The client view, the value stored at publication
// time and the share messages all read it through here so they cannot disagree.
export function reportPeriod(config: AnalysisConfig, data: Pick<AnalysisData, "effective_period"> | null) {
  return {
    since: data?.effective_period?.since ?? config.since,
    until: data?.effective_period?.until ?? config.until,
    compareSince: data?.effective_period?.compare_since ?? config.compare_since,
    compareUntil: data?.effective_period?.compare_until ?? config.compare_until,
  };
}
