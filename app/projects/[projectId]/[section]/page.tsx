import { notFound } from "next/navigation";
import { WorkspacePage } from "@/app/_components/workspace-page";
import { isProjectSection } from "@/lib/projects/routes";

export const dynamic = "force-dynamic";

export default async function ProjectSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, section } = await params;
  if (!isProjectSection(section) || section === "overview") notFound();
  return (
    <WorkspacePage
      path={`/projects/${projectId}/${section}`}
      projectId={projectId}
      view={section}
      searchParams={searchParams}
    />
  );
}
