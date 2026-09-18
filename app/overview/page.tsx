import { WorkspacePage } from "@/app/_components/workspace-page";

export const dynamic = "force-dynamic";

export default function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspacePage path="/overview" view="overview" searchParams={searchParams} />;
}
