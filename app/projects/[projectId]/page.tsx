import { WorkspacePage } from "@/app/_components/workspace-page";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  return <WorkspacePage path={`/projects/${projectId}`} projectId={projectId} view="overview" searchParams={searchParams} />;
}
