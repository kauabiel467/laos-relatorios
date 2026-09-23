import type { Metadata } from "next";
import { ClientReportView } from "@/components/projects/client-report-view";
import { ReportUnavailable } from "@/components/projects/report-unavailable";
import { ProjectAccessError } from "@/lib/projects/access";
import { loadReportPreview, type ClientReport } from "@/lib/projects/public-report";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pré-visualização do relatório",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// Private "ver como cliente": renders the current saved version through the same
// view as the public link, but only for a signed-in member of the project.
export default async function ProjectReportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; documentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, documentId } = await params;
  const { print } = await searchParams;
  let report: ClientReport;
  try {
    report = await loadReportPreview(projectId, documentId);
  } catch (error) {
    if (error instanceof ProjectAccessError && error.status === 401) {
      return (
        <ReportUnavailable
          title="Entre para ver a pré-visualização."
          message="Esta página é privada e só abre para quem tem acesso ao projeto."
          loginHref="/login"
        />
      );
    }
    return (
      <ReportUnavailable
        title="Não foi possível abrir a pré-visualização."
        message={error instanceof ProjectAccessError ? error.message : "Tente novamente em instantes."}
      />
    );
  }
  return <ClientReportView report={report} mode="preview" autoPrint={print === "1"} />;
}
