import { WorkspacePage } from "@/app/_components/workspace-page";

export const dynamic = "force-dynamic";

export default function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <WorkspacePage path="/projects" view="projects" searchParams={searchParams} />;
}
