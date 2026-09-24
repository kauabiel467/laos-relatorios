import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClientReportView } from "@/components/projects/client-report-view";
import { ReportUnavailable } from "@/components/projects/report-unavailable";
import { loadAutomationRunReportByToken } from "@/lib/projects/public-report";
import { rateLimit, requestIp } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

// The token is the credential: keep the page out of search indexes and never
// leak the URL through the Referer header of anything the report links to.
export const metadata: Metadata = {
  title: "Relatório de desempenho",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PublicRunReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { print } = await searchParams;
  const limit = rateLimit(`public-run-report:${requestIp({ headers: await headers() })}`, 120, 60_000);
  if (!limit.allowed) {
    return <ReportUnavailable title="Muitas tentativas." message="Aguarde um momento e abra o link novamente." />;
  }
  const report = await loadAutomationRunReportByToken(token);
  if (!report) return <ReportUnavailable />;
  return <ClientReportView report={report} mode="public" autoPrint={print === "1"} />;
}
