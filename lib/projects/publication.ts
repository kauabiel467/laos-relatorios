import type { ProjectDocument } from "@/lib/projects/model";

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
