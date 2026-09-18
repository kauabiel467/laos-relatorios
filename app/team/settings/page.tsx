import { WorkspacePage } from "@/app/_components/workspace-page";

export const dynamic = "force-dynamic";

export default function TeamSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspacePage path="/team/settings" view="team" searchParams={searchParams} />;
}
