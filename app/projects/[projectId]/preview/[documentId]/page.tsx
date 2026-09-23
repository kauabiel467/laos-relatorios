import { DocumentPreviewView } from "@/components/projects/document-preview-view";

export const dynamic = "force-dynamic";

export default async function ProjectDocumentPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
}) {
  const { projectId, documentId } = await params;
  return <DocumentPreviewView clientId={projectId} documentId={documentId} />;
}
