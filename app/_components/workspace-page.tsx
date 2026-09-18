import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ProjectsWorkspace } from "@/components/projects/workspace";
import type { WorkspaceView } from "@/lib/projects/routes";
import { hasSupabaseEnv } from "@/lib/env";
import { projectAccess, ProjectAccessError, requireProjectSession } from "@/lib/projects/access";

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
  const session = await requireProjectSession().catch((error: unknown) => {
    if (error instanceof ProjectAccessError && error.status === 401) redirect(login);
    throw error;
  });

  if (projectId) {
    if (!z.string().uuid().safeParse(projectId).success) notFound();
    const access = await projectAccess(projectId, session).catch((error: unknown) => {
      if (error instanceof ProjectAccessError && error.status === 404) notFound();
      throw error;
    });
    if (["integrations", "settings", "access"].includes(view) && !access.role) notFound();
  }

  return (
    <Suspense fallback={<main className="agency-loading">Carregando sua área de trabalho…</main>}>
      <ProjectsWorkspace initialProjectId={projectId} initialView={view} />
    </Suspense>
  );
}
