import { PublicDashboardView } from "@/components/public/public-dashboard-view";

export const dynamic = "force-dynamic";

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicDashboardView token={token} />;
}
