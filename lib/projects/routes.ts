export const PROJECT_SECTIONS = [
  "overview",
  "dashboards",
  "reports",
  "integrations",
  "automations",
  "timeline",
  "goals",
  "settings",
  "access",
] as const;

export type ProjectSection = (typeof PROJECT_SECTIONS)[number];
export type WorkspaceView = "projects" | "overview" | "templates" | "team" | ProjectSection;

export function isProjectSection(value: string): value is ProjectSection {
  return PROJECT_SECTIONS.includes(value as ProjectSection);
}

function queryString(values?: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function projectHref(
  projectId: string,
  section: ProjectSection = "overview",
  query?: Record<string, string | undefined>,
) {
  const id = encodeURIComponent(projectId);
  const base = section === "overview" ? `/projects/${id}` : `/projects/${id}/${section}`;
  return base + queryString(query);
}

export function workspaceHref(
  view: WorkspaceView,
  options: {
    projectId?: string;
    documentId?: string;
    legacyDocumentId?: string;
    create?: string;
    onboarding?: string;
    preview?: string;
    meta?: string;
    reason?: string;
    teamId?: string;
  } = {},
) {
  const query = {
    document: options.documentId,
    legacyDocument: options.legacyDocumentId,
    create: options.create,
    onboarding: options.onboarding,
    preview: options.preview,
    meta: options.meta,
    reason: options.reason,
    team: options.teamId,
    project: view === "templates" ? options.projectId : undefined,
  };
  if (options.projectId && isProjectSection(view)) {
    return projectHref(options.projectId, view, query);
  }
  if (view === "overview") return `/overview${queryString(query)}`;
  if (view === "templates") return `/templates${queryString(query)}`;
  if (view === "team") return `/team/settings${queryString(query)}`;
  return `/projects${queryString(query)}`;
}

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function legacyRootHref(params: Record<string, string | string[] | undefined>) {
  const projectId = stringParam(params.project);
  const documentId = stringParam(params.document);
  const legacyView = stringParam(params.view);
  const create = stringParam(params.create);
  const preview = stringParam(params.preview);
  const onboarding = stringParam(params.onboarding);
  const mappedView: WorkspaceView =
    legacyView === "overview"
      ? "overview"
      : legacyView === "templates"
        ? "templates"
        : legacyView === "team"
          ? "team"
          : projectId && isProjectSection(legacyView ?? "")
            ? (legacyView as ProjectSection)
            : projectId
              ? "overview"
              : "projects";
  return workspaceHref(mappedView, {
    projectId,
    documentId,
    legacyDocumentId: stringParam(params.legacyDocument),
    create,
    preview,
    onboarding,
    meta: stringParam(params.meta),
    reason: stringParam(params.reason),
    teamId: stringParam(params.team),
  });
}

export function legacyOperationsHref(params: Record<string, string | string[] | undefined>) {
  const projectId = stringParam(params.client);
  const view = stringParam(params.view) ?? "home";
  if (!projectId) {
    if (view === "settings") return workspaceHref("team");
    if (view === "home") return workspaceHref("overview");
    return workspaceHref("projects");
  }
  const mapped: ProjectSection =
    view === "reports"
      ? "reports"
      : view === "goals"
        ? "goals"
        : view === "timeline"
          ? "timeline"
          : view === "integrations"
            ? "integrations"
            : view === "settings"
              ? "settings"
              : "overview";
  return projectHref(projectId, mapped);
}
