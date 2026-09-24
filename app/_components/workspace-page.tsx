import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ProjectsWorkspace } from "@/components/projects/workspace";
import type { WorkspaceView } from "@/lib/projects/routes";
import { hasSupabaseEnv } from "@/lib/env";
import { ProjectAccessError } from "@/lib/projects/access";
import { loadProjectWorkspace } from "@/lib/projects/service";

export async function WorkspacePage({
  path,
  projectId = "",
  view,
  searchParams,
}: {
  path: string;
  projectId?: string;
  view: WorkspaceView;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["document", "legacyDocument", "create", "preview", "project", "onboarding", "meta", "reason", "team"]) {
    const value = params?.[key];
    if (typeof value === "string") query.set(key, value);
  }
  const target = path + (query.size ? `?${query.toString()}` : "");
  const login = `/login?next=${encodeURIComponent(target)}`;
  if (!hasSupabaseEnv()) redirect(login);
  const scopedProjectId = projectId || (view === "templates" ? query.get("project") ?? "" : "");
  if (scopedProjectId && !z.string().uuid().safeParse(scopedProjectId).success) notFound();

  const workspace = await loadProjectWorkspace(
    scopedProjectId || undefined,
    query.get("document") ?? undefined,
    query.get("legacyDocument") ?? undefined,
  ).catch((error: unknown) => {
    if (error instanceof ProjectAccessError && error.status === 401) redirect(login);
    if (error instanceof ProjectAccessError && error.status === 404) notFound();
    throw error;
  });
  const { documents, legacyDocuments, ...data } = workspace;

  if (
    projectId &&
    ["integrations", "automations", "settings", "access"].includes(view) &&
    !data.projectRoles[projectId]
  ) {
    notFound();
  }

  return (
    <ProjectsWorkspace
      key={JSON.stringify([projectId || view, query.get("document"), query.get("legacyDocument")])}
      initialProjectId={projectId}
      initialView={view}
      initialQuery={Object.fromEntries(query)}
      initialSnapshot={{ data, documents, legacyDocuments }}
    />
  );
}
