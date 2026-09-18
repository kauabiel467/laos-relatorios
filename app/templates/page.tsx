import { WorkspacePage } from "@/app/_components/workspace-page";

export const dynamic = "force-dynamic";

export default function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspacePage path="/templates" view="templates" searchParams={searchParams} />;
}
