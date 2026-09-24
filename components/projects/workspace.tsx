/* eslint-disable @next/next/no-img-element */
"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AgencyData, AgencyClient, AgencyRecord } from "@/lib/agency/types";
import type { MetaIntegrationStatus } from "@/lib/types";
import type { AnalysisConfig, ProjectDocument } from "@/lib/projects/model";
import { isProjectSection, workspaceHref, type WorkspaceView } from "@/lib/projects/routes";
import { TeamSettingsModal } from "@/components/dashboard/team-settings-modal";
import {
  firstProjectValidationError,
  projectCreateSchema,
  projectDetailsFromForm,
  projectDetailsSchema,
} from "@/lib/projects/config";
import { AnalysisWizard } from "./wizard";
import { AnalysisView } from "./analysis-view";
import { PreservedReport } from "./preserved-report";
import { ProjectDetailsFields } from "./project-details-fields";
import { ProjectAccessPanel } from "./project-access-panel";
import { ProjectAutomationsView } from "./project-automations-view";
import { ProjectIntegrations } from "./project-integrations";
import { ProjectSetupFlow } from "./project-setup-flow";
import { WorkspaceTemplatesView } from "./workspace-templates-view";
import { WorkspaceTeamView } from "./workspace-team-view";
import { WorkspaceProjectsView } from "./workspace-projects-view";
import { WorkspaceOverviewView } from "./workspace-overview-view";
import { ProjectOverviewView } from "./project-overview-view";
import { ProjectTimelineGoalsView } from "./project-timeline-goals-view";
import { WorkspaceMetaModal } from "./workspace-meta-modal";
import { GoalUpdateDialog, RecordCreateDialog } from "./workspace-record-dialogs";
import { WorkspaceShell } from "./workspace-shell";
import { Empty, FieldMessage, LoadingState, Toast } from "./ui";
import type { WorkspaceNavIconName } from "./workspace-nav-icon";
import { InterfaceIcon } from "./interface-icon";
import "./projects.css";
const viewLabels: Record<WorkspaceView, string> = {
  projects: "Projetos",
  overview: "Visão geral",
  dashboards: "Dashboards",
  reports: "Relatórios",
  integrations: "Integrações",
  automations: "Automações",
  timeline: "Linha do tempo",
  goals: "Metas",
  settings: "Dados do projeto",
  access: "Equipe e acesso",
  templates: "Templates",
  team: "Equipe",
};
const empty: AgencyData = {
  clients: [],
  records: [],
  teams: [],
  staffClientIds: [],
  projectRoles: {},
  projectMembers: [],
  clientAccess: [],
  clientInvitations: [],
  projectMetaConnection: null,
  projectIfoodConnection: null,
  isStaff: false,
  userName: "",
};
export type WorkspaceSnapshot = {
  data: AgencyData;
  documents: ProjectDocument[];
  legacyDocuments: AgencyRecord[];
};
const workspaceSnapshots = new Map<string, WorkspaceSnapshot>();
export function ProjectsWorkspace({
  initialProjectId = "",
  initialView = "projects",
  initialQuery = {},
  initialSnapshot,
}: {
  initialProjectId?: string;
  initialView?: WorkspaceView;
  initialQuery?: Record<string, string>;
  initialSnapshot?: WorkspaceSnapshot;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [activeView, setActiveView] = useState(initialView);
  const cid = initialProjectId || (initialView === "templates" ? initialQuery.project ?? "" : ""),
    view = activeView,
    docId = initialQuery.document ?? "",
    legacyDocId = initialQuery.legacyDocument ?? "",
    creating = initialQuery.create;
  const routeIdentity = JSON.stringify([cid, docId, legacyDocId]);
  const availableSnapshot = initialSnapshot ?? workspaceSnapshots.get(routeIdentity);
  const [data, setData] = useState<AgencyData>(availableSnapshot?.data ?? empty),
    [docs, setDocs] = useState<ProjectDocument[]>(availableSnapshot?.documents ?? []),
    [legacyDocs, setLegacyDocs] = useState<AgencyRecord[]>(availableSnapshot?.legacyDocuments ?? []),
    [loading, setLoading] = useState(!availableSnapshot),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [toast, setToast] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent"),
    [team, setTeam] = useState(false),
    [modal, setModal] = useState(""),
    [meta, setMeta] = useState<MetaIntegrationStatus | null>(null),
    [metaLoading, setMetaLoading] = useState(false),
    [metaError, setMetaError] = useState(""),
    [accountSearch, setAccountSearch] = useState(""),
    [account, setAccount] = useState(""),
    [goalId, setGoalId] = useState(""),
    [sidebarOpen, setSidebarOpen] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [accountMenuOpen, setAccountMenuOpen] = useState(false),
    [theme, setTheme] = useState<"dark" | "light">("dark");
  const busyRef = useRef(false);
  const createMenuRef = useRef<HTMLDetailsElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeMenu = (returnFocus = false) => {
      const details = createMenuRef.current;
      if (!details?.open) return;
      details.open = false;
      if (returnFocus) details.querySelector<HTMLElement>("summary")?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };
    window.document.addEventListener("pointerdown", onPointerDown);
    window.document.addEventListener("keydown", onKeyDown);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown);
      window.document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  useEffect(() => {
    const saved = window.localStorage.getItem("laos-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
    setSidebarCollapsed(window.localStorage.getItem("laos-sidebar-collapsed") === "1");
  }, []);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const menu = accountMenuRef.current?.querySelector<HTMLElement>("[role='menu']");
    menu?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const close = (restoreFocus = false) => {
      setAccountMenuOpen(false);
      if (restoreFocus) accountMenuRef.current?.querySelector<HTMLElement>("[aria-haspopup='menu']")?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    window.document.addEventListener("pointerdown", onPointerDown);
    window.document.addEventListener("keydown", onKeyDown);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown);
      window.document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    window.document.documentElement.style.colorScheme = theme;
    let themeColor = window.document.head.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][data-laos-theme]',
    );
    if (!themeColor) {
      themeColor = window.document.createElement("meta");
      themeColor.name = "theme-color";
      themeColor.dataset.laosTheme = "true";
      window.document.head.appendChild(themeColor);
    }
    themeColor.content = theme === "dark" ? "#090c12" : "#f4f7fb";
    return () => {
      window.document.documentElement.style.colorScheme = "";
      themeColor?.remove();
    };
  }, [theme]);
  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("laos-theme", next);
      return next;
    });
  };
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("laos-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };
  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  };
  const project = data.clients.find((c) => c.id === cid) as
    | AgencyClient
    | undefined;
  const staff = project ? data.staffClientIds.includes(cid) : data.isStaff;
  const projectRole = cid ? data.projectRoles[cid] : undefined;
  const canManageAccess = projectRole === "owner" || projectRole === "manager";
  const onboardingParam = initialQuery.onboarding;
  const onboardingValue = ["1", "2", "3", "4"].includes(onboardingParam ?? "")
    ? onboardingParam
    : null;
  const onboardingStep = (onboardingValue
    ? Number(onboardingValue)
    : project?.onboarding_step ?? 1) as 1 | 2 | 3 | 4;
  const selectedTeamId = project?.team_id ?? initialQuery.team ?? data.teams[0]?.id;
  const selectedTeam = data.teams.find((item) => item.id === selectedTeamId);
  const workspaceLabel = project
    ? selectedTeam?.name ?? "Acesso de cliente"
    : view === "team"
      ? selectedTeam?.name ?? "Workspace indisponível"
      : data.teams.length === 1 ? data.teams[0].name : data.isStaff ? "Workspaces autorizados" : "Meu acesso";
  const document = docs.find((d) => d.id === docId && d.client_id === cid);
  const projectDocs = docs.filter(
    (d) => d.client_id === cid && d.kind !== "template",
  );
  const visibleProjectDocs = projectDocs.filter((item) =>
    view === "dashboards"
      ? item.kind === "dashboard"
      : view === "reports"
        ? item.kind === "report"
        : true,
  );
  const legacyReports = legacyDocs.filter((record) => record.client_id === cid);
  const legacyDocument = legacyReports.find((record) => record.id === legacyDocId);
  const navigate = (values: Record<string, string>) => {
    const nextProjectId = values.project ?? "";
    const nextDocumentId = values.document;
    const nextDocument = nextDocumentId
      ? docs.find((item) => item.id === nextDocumentId)
      : undefined;
    const nextView: WorkspaceView = values.view
      ? (values.view as WorkspaceView)
      : nextDocument?.kind === "report"
        ? "reports"
        : nextDocument?.kind === "template"
          ? "templates"
          : nextDocument?.kind === "dashboard"
            ? "dashboards"
          : nextProjectId
            ? values.create === "report"
              ? "reports"
              : values.create === "dashboard"
                ? "dashboards"
                : "overview"
            : "projects";
    const href = workspaceHref(nextView, {
      projectId: nextProjectId,
      documentId: nextDocumentId,
      legacyDocumentId: values.legacyDocument,
      create: values.create,
      onboarding: values.onboarding,
      preview: values.preview,
      teamId: values.team,
    });
    const isLocalProjectTab =
      Boolean(initialProjectId) &&
      nextProjectId === cid &&
      isProjectSection(nextView) &&
      !docId &&
      !legacyDocId &&
      !creating &&
      !onboardingValue &&
      !initialQuery.meta &&
      !nextDocumentId &&
      !values.legacyDocument &&
      !values.create &&
      !values.onboarding;
    if (isLocalProjectTab) {
      window.history.pushState(null, "", href);
      setActiveView(nextView);
    } else {
      startNavigation(() => router.push(href));
    }
    setSearch("");
    setNotice("");
    setFormError("");
    setSidebarOpen(false);
  };
  useEffect(() => setActiveView(initialView), [initialView]);
  useEffect(() => {
    if (!initialProjectId) return;
    const syncViewWithHistory = () => {
      const [root, encodedProjectId, section] = window.location.pathname
        .split("/")
        .filter(Boolean);
      if (root !== "projects" || decodeURIComponent(encodedProjectId ?? "") !== initialProjectId) return;
      const nextView = section ?? "overview";
      if (isProjectSection(nextView)) setActiveView(nextView);
    };
    window.addEventListener("popstate", syncViewWithHistory);
    return () => window.removeEventListener("popstate", syncViewWithHistory);
  }, [initialProjectId]);
  const activeProjectRef = useRef(routeIdentity);
  activeProjectRef.current = routeIdentity;
  const reload = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (cid) query.set("project", cid);
    if (docId) query.set("document", docId);
    if (legacyDocId) query.set("legacyDocument", legacyDocId);
    const projectQuery = query.size ? `?${query.toString()}` : "";
    const response = await fetch(`/api/projects${projectQuery}`, { cache: "no-store", signal });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error);
    if (signal?.aborted || activeProjectRef.current !== routeIdentity) return;
    workspaceSnapshots.set(routeIdentity, {
      data: payload,
      documents: payload.documents,
      legacyDocuments: payload.legacyDocuments,
    });
    setData(payload);
    setDocs(payload.documents);
    setLegacyDocs(payload.legacyDocuments);
  }, [cid, docId, legacyDocId, routeIdentity]);
  useEffect(() => {
    const controller = new AbortController();
    const snapshot = initialSnapshot ?? workspaceSnapshots.get(routeIdentity);
    if (snapshot) {
      workspaceSnapshots.set(routeIdentity, snapshot);
      setData(snapshot.data);
      setDocs(snapshot.documents);
      setLegacyDocs(snapshot.legacyDocuments);
      setLoading(false);
      setError("");
      return () => controller.abort();
    } else {
      setLoading(true);
    }
    setError("");
    reload(controller.signal)
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (snapshot) {
          setNotice("Não foi possível atualizar os dados agora. Exibindo a última versão carregada.");
        } else {
          setError(e.message);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [initialSnapshot, reload, routeIdentity]);
  useEffect(() => {
    const section = document?.kind === "template" ? "templates" : document?.kind === "report" || legacyDocument ? "reports" : document ? "dashboards" : undefined;
    if (section && view !== section) router.replace(workspaceHref(section, {
      projectId: cid,
      documentId: document?.id,
      legacyDocumentId: legacyDocument?.id,
      preview: initialQuery.preview,
    }));
  }, [document, legacyDocument, view, router, cid, initialQuery.preview]);
  const request = async (path: string, body: unknown) => {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    return d;
  };
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await fn();
      await reload();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível concluir.";
      setNotice(`${message} Revise os dados e tente novamente.`);
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const openMeta = useCallback(async (oauthError = "") => {
    setNotice("");
    setMetaError(oauthError);
    setMetaLoading(true);
    setMeta(null);
    setModal("meta");
    try {
      const r = await fetch("/api/integrations/meta/status");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMeta(d);
      setAccount("");
    } catch (e) {
      setMetaError(
        e instanceof Error ? e.message : "Não foi possível abrir a conexão.",
      );
    } finally {
      setMetaLoading(false);
    }
  }, []);
  useEffect(() => {
    if (initialQuery.meta) {
      const reason =
        initialQuery.meta === "error"
          ? initialQuery.reason || "A autorização não foi concluída."
          : "";
      void openMeta(reason);
      router.replace(
        workspaceHref("integrations", {
          projectId: cid,
          onboarding: onboardingValue ?? undefined,
        }),
      );
    }
  }, [initialQuery.meta, initialQuery.reason, cid, router, openMeta, onboardingValue]);
  async function bind() {
    await run(async () => {
      if (meta?.stage === "needs_selection")
        await request("/api/integrations/meta/select", {
          accountIds: [account],
        });
      await request("/api/projects", {
        action: "bind",
        client_id: cid,
        account_id: account,
      });
      setModal("");
      setToast(
        "Conta vinculada e testada com sucesso. A coleta está pronta.",
      );
    });
  }
  async function createProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = projectCreateSchema.safeParse({
      ...projectDetailsFromForm(f),
      team_id: String(f.get("team_id") ?? ""),
    });
    if (!parsed.success) {
      setFormError(firstProjectValidationError(parsed.error));
      return;
    }
    setFormError("");
    await run(async () => {
      const p = await request("/api/projects", {
        action: "client",
        value: parsed.data,
      });
      navigate({ project: p.id, view: "access", onboarding: "2" });
    });
  }
  async function createDocument(title: string, config: AnalysisConfig) {
    await run(async () => {
      const d = await request("/api/projects", {
        action: "create",
        client_id: cid,
        kind: creating,
        title,
        config,
      });
      navigate({ project: cid, document: d.id, view: d.kind === "report" ? "reports" : "dashboards" });
    });
  }
  async function documentAction(
    action: string,
    extra?: Record<string, unknown>,
  ) {
    return run(async () => {
      const d = await request("/api/projects", {
        action,
        client_id: cid,
        id: docId,
        ...extra,
      });
      if (action === "delete") navigate({ project: cid });
      else if (d.id && action !== "template")
        navigate({ project: cid, document: d.id, view: d.kind === "report" ? "reports" : d.kind === "template" ? "templates" : "dashboards" });
      else
        setToast(
          action === "template"
            ? "Template salvo na biblioteca da equipe."
            : action === "timeline"
              ? "Documento adicionado ao histórico."
              : "Alterações salvas.",
        );
      return d as ProjectDocument;
    });
  }
  async function projectSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = projectDetailsSchema.safeParse(projectDetailsFromForm(f));
    if (!parsed.success) {
      setFormError(firstProjectValidationError(parsed.error));
      return;
    }
    setFormError("");
    await run(async () => {
      await request("/api/projects", {
        action: "project",
        client_id: cid,
        value: parsed.data,
      });
      setToast("Preferências do projeto salvas.");
    });
  }
  const setupView = (step: 1 | 2 | 3 | 4): WorkspaceView =>
    step === 1
      ? "settings"
      : step === 2
        ? "access"
        : step === 3
          ? "integrations"
          : "overview";
  const navigateSetup = (step: 1 | 2 | 3 | 4) =>
    navigate({
      project: cid,
      view: setupView(step),
      onboarding: String(step),
    });
  async function saveSetupDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = projectDetailsSchema.safeParse(
      projectDetailsFromForm(new FormData(e.currentTarget)),
    );
    if (!parsed.success) {
      setNotice(firstProjectValidationError(parsed.error));
      return;
    }
    await run(async () => {
      await request("/api/projects", {
        action: "project",
        client_id: cid,
        value: parsed.data,
      });
      await request("/api/projects", {
        action: "advance_onboarding",
        client_id: cid,
        step: 2,
      });
      navigateSetup(2);
    });
  }
  async function advanceSetup(step: 2 | 3 | 4) {
    await run(async () => {
      await request("/api/projects", {
        action: "advance_onboarding",
        client_id: cid,
        step,
      });
      navigateSetup(step);
    });
  }
  async function finishSetup(kind: "dashboard" | "report") {
    await run(async () => {
      await request("/api/projects", {
        action: "complete_setup",
        client_id: cid,
      });
      navigate({ project: cid, view: kind === "report" ? "reports" : "dashboards", create: kind });
    });
  }
  async function inviteClient(email: string) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      const result = await request("/api/projects", {
        action: "access",
        client_id: cid,
        email,
      });
      await reload();
      setToast(result.message ?? "Convite salvo.");
      return true;
    } catch (error) {
      setNotice(
        `${error instanceof Error ? error.message : "Não foi possível salvar o convite."} Confirme o e-mail e tente novamente.`,
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function revokeClient(userId: string) {
    await run(async () => {
      await request("/api/projects", {
        action: "revoke_access",
        client_id: cid,
        user_id: userId,
      });
      setToast("Acesso do cliente revogado.");
    });
  }
  async function revokeInvitation(invitationId: string) {
    await run(async () => {
      await request("/api/projects", {
        action: "revoke_invitation",
        client_id: cid,
        invitation_id: invitationId,
      });
      setToast("Convite cancelado.");
    });
  }
  async function testMetaConnection() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    try {
      await request("/api/projects", {
        action: "test_integration",
        client_id: cid,
      });
      setToast("Teste concluído: conta e leitura de Insights disponíveis.");
    } catch (error) {
      setNotice(
        `${error instanceof Error ? error.message : "Não foi possível testar a conexão."} Verifique a autorização Meta e tente novamente.`,
      );
    } finally {
      await reload().catch(() => undefined);
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function unlinkMetaConnection() {
    await run(async () => {
      await request("/api/projects", { action: "unlink", client_id: cid });
      setToast("A conta Meta foi desvinculada deste projeto.");
    });
  }
  const newDocument = (kind: string) => {
    if (data.projectMetaConnection?.connection_status !== "connected") {
      setNotice("Conecte e teste a conta Meta deste projeto antes de gerar a análise.");
      navigate({ project: cid, view: "integrations" });
      return;
    }
    navigate({ project: cid, create: kind });
  };
  const filtered = data.clients
    .filter((c) =>
      (c.name + " " + c.segment).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : latest(b.id).localeCompare(latest(a.id)),
    );
  function latest(id: string) {
    return [
      ...docs
        .filter((d) => d.client_id === id && d.kind !== "template")
        .map((d) => d.created_at),
      ...legacyDocs
        .filter((record) => record.client_id === id)
        .map((record) => record.created_at),
      data.clients.find((c) => c.id === id)?.created_at ?? "",
    ]
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a))[0] ?? "";
  }
  const pageTitle =
    creating === "project"
      ? "Novo projeto"
      : onboardingValue && project
        ? "Configurar projeto"
        : creating === "dashboard"
          ? "Novo dashboard"
          : creating === "report"
            ? "Novo relatório"
            : project
              ? viewLabels[view]
              : view === "overview"
                ? "Overview da agência"
                : view === "templates"
                  ? "Meus templates"
                  : view === "team"
                    ? "Equipe e configurações"
                    : "Meus projetos";
  const pageContext = project
    ? `${project.name}${project.segment ? ` · ${project.segment}` : ""}`
    : workspaceLabel;
  const canCreateDocumentFromScreen =
    Boolean(project) &&
    !creating &&
    staff &&
    !onboardingValue &&
    Boolean(project?.onboarding_completed_at) &&
    data.projectMetaConnection?.connection_status === "connected" &&
    ["overview", "dashboards", "reports"].includes(view);
  const primaryDocumentKind = view === "reports" ? "report" : "dashboard";
  const globalNavigation: Array<{
    label: string;
    icon: WorkspaceNavIconName;
    active: boolean;
    values: Record<string, string>;
    visible?: boolean;
  }> = [
    { label: "Visão geral", icon: "overview", active: !cid && view === "overview", values: { view: "overview" } },
    { label: "Projetos", icon: "projects", active: view === "projects" || (Boolean(cid) && view !== "templates"), values: {} },
    { label: "Templates", icon: "templates", active: view === "templates", values: { view: "templates" }, visible: data.isStaff },
    { label: "Equipe", icon: "team", active: !cid && view === "team", values: { view: "team" }, visible: data.isStaff },
  ];
  const projectNavigation: Array<{
    label: string;
    icon: WorkspaceNavIconName;
    view: WorkspaceView;
    visible?: boolean;
  }> = [
    { label: "Visão geral", icon: "overview", view: "overview" },
    { label: "Dashboards", icon: "dashboards", view: "dashboards" },
    { label: "Relatórios", icon: "reports", view: "reports" },
    { label: "Integrações", icon: "integrations", view: "integrations", visible: staff },
    { label: "Automações", icon: "automations", view: "automations", visible: staff },
    { label: "Linha do tempo", icon: "timeline", view: "timeline" },
    { label: "Metas", icon: "goals", view: "goals" },
    { label: "Dados do projeto", icon: "settings", view: "settings", visible: staff },
    { label: "Equipe e acesso", icon: "access", view: "access", visible: staff },
  ];
  return (
    <div className={`projects pj-mosaic-shell theme-${theme} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      {isNavigating ? (
        <div className="pj-route-progress" role="status" aria-label="Carregando próxima tela">
          <span aria-hidden="true" />
        </div>
      ) : null}
      <WorkspaceShell
        theme={theme}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        accountMenuOpen={accountMenuOpen}
        accountMenuRef={accountMenuRef}
        project={project}
        cid={cid}
        view={view}
        isStaff={data.isStaff}
        userName={data.userName}
        workspaceLabel={workspaceLabel}
        globalNavigation={globalNavigation}
        projectNavigation={projectNavigation}
        pageTitle={pageTitle}
        pageContext={pageContext}
        onNavigate={navigate}
        onCloseSidebar={() => setSidebarOpen(false)}
        onOpenSidebar={() => setSidebarOpen(true)}
        onToggleSidebarCollapse={toggleSidebar}
        onToggleAccountMenu={() => setAccountMenuOpen((open) => !open)}
        onOpenTeamSettings={() => {
          setAccountMenuOpen(false);
          navigate({ view: "team" });
        }}
        onToggleTheme={toggleTheme}
        onSignOut={() => void signOut()}
      />
      <div id="workspace-main" className="pj-main-slot">
      {notice && creating !== "project" && !onboardingValue && (
        <div className="pj-notice" role="alert">
          <div>
            <strong>Atenção necessária</strong>
            <span>{notice}</span>
          </div>
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <InterfaceIcon name="close" size={18} />
          </button>
        </div>
      )}
      {loading ? (
        <main className="pj-container">
          <LoadingState label="Carregando seus projetos" />
        </main>
      ) : error ? (
        <main className="pj-container">
          <div role="alert" className="pj-warning">
            {error}
          </div>
          <button
            onClick={() => {
              setLoading(true);
              setError("");
              reload()
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Tentar novamente
          </button>
        </main>
      ) : legacyDocId && project && legacyDocument ? (
        <PreservedReport record={legacyDocument} clientName={project.name} onBack={() => navigate({ project: cid, view: "reports" })} />
      ) : docId && project && document ? (
        <div className="pj-document-shell">
        <nav className="pj-breadcrumbs pj-document-breadcrumbs" aria-label="Caminho atual">
          <button onClick={() => navigate({})}>Projetos</button>
          <span aria-hidden="true">/</span>
          <button onClick={() => navigate({ project: cid })}>{project.name}</button>
          <span aria-hidden="true">/</span>
          <button onClick={() => navigate(document.kind === "template" ? { view: "templates" } : { project: cid, view: document.kind === "report" ? "reports" : "dashboards" })}>
            {document.kind === "template" ? "Templates" : document.kind === "report" ? "Relatórios" : "Dashboards"}
          </button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{document.title}</span>
        </nav>
        <AnalysisView
          key={document.id}
          document={document}
          clientName={project.name}
          logo={project.logo_url}
          staff={staff}
          initialPreview={initialQuery.preview === "1"}
          busy={busy}
          onBack={() => navigate({ project: cid })}
          onAction={documentAction}
        />
        </div>
      ) : docId || legacyDocId ? (
        <main className="pj-container">
          <Empty title="Documento indisponível">
            <p>Ele pode não estar publicado ou sua conta não tem acesso.</p>
            <button onClick={() => navigate({})}>Voltar aos projetos</button>
          </Empty>
        </main>
      ) : (
        <>
          <div className="pj-page-heading">
            <div className="pj-container">
              <div className="pj-title-group">
                {project ? (
                  <span className="pj-project-avatar" aria-hidden="true">
                    {project.logo_url ? (
                      <img src={project.logo_url} alt="" />
                    ) : (
                      project.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                ) : null}
                <div>
                  <span className="pj-heading-eyebrow">
                    {project ? "Projeto" : "Workspace"}
                  </span>
                  <h1>{pageTitle}</h1>
                  <p className="pj-heading-context">{pageContext}</p>
                </div>
              </div>
              {!cid && !creating && data.isStaff && view === "projects" && (
                <button
                  className="accent"
                  onClick={() => navigate({ create: "project" })}
                >
                  <InterfaceIcon name="plus" size={18} /> Novo projeto
                </button>
              )}
              {canCreateDocumentFromScreen && (
                <div className="pj-screen-actions" aria-label="Ações da tela">
                  <button
                    className="accent"
                    onClick={() => newDocument(primaryDocumentKind)}
                  >
                    {primaryDocumentKind === "report"
                      ? "Criar relatório"
                      : "Criar dashboard"}
                  </button>
                  <details
                    ref={createMenuRef}
                    className="pj-context-menu"
                    onToggle={(event) => {
                      if (event.currentTarget.open) {
                        window.requestAnimationFrame(() =>
                          event.currentTarget.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus(),
                        );
                      }
                    }}
                  >
                    <summary aria-label="Mais ações de criação" aria-haspopup="menu">
                      Mais ações
                      <InterfaceIcon name="chevron-down" size={16} />
                    </summary>
                    <div role="menu">
                      <button
                        role="menuitem"
                        onClick={() =>
                          newDocument(
                            primaryDocumentKind === "report"
                              ? "dashboard"
                              : "report",
                          )
                        }
                      >
                        {primaryDocumentKind === "report"
                          ? "Criar dashboard"
                          : "Criar relatório"}
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
          <main className="pj-container">
            <nav className="pj-breadcrumbs" aria-label="Caminho atual">
              <button onClick={() => navigate({})}>Projetos</button>
              {project ? (
                <>
                  <span aria-hidden="true">/</span>
                  <button onClick={() => navigate({ project: cid })}>{project.name}</button>
                  <span aria-hidden="true">/</span>
                  {creating || onboardingValue ? (
                    <>
                      <button
                        onClick={() =>
                          navigate({
                            project: cid,
                            view:
                              creating === "report"
                                ? "reports"
                                : creating === "dashboard"
                                  ? "dashboards"
                                  : "overview",
                          })
                        }
                      >
                        {creating === "report"
                          ? "Relatórios"
                          : creating === "dashboard"
                            ? "Dashboards"
                            : "Visão geral"}
                      </button>
                      <span aria-hidden="true">/</span>
                      <span aria-current="page">{pageTitle}</span>
                    </>
                  ) : (
                    <span aria-current="page">{viewLabels[view]}</span>
                  )}
                </>
              ) : creating === "project" ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">Novo projeto</span>
                </>
              ) : view !== "projects" ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">
                    {view === "overview" ? "Overview" : view === "templates" ? "Templates" : "Equipe"}
                  </span>
                </>
              ) : null}
            </nav>
            {creating === "project" ? (
              <div className="pj-setup pj-new-project-setup">
                <aside className="pj-setup-sidebar">
                  <span className="pj-section-label">NOVO PROJETO</span>
                  <h2>Prepare o cliente para a primeira análise</h2>
                  <p>
                    Comece pelos dados do negócio. Equipe, integração e revisão
                    serão configuradas nas próximas etapas.
                  </p>
                  <ol className="pj-setup-progress" aria-label="Etapas da configuração">
                    {["Dados do projeto", "Equipe e acesso", "Integrações", "Finalização"].map(
                      (label, index) => (
                        <li key={label} className={index === 0 ? "active" : ""}>
                          <span aria-hidden="true">{index + 1}</span>
                          <strong>{label}</strong>
                        </li>
                      ),
                    )}
                  </ol>
                </aside>
                <section className="pj-setup-main">
                  <form onSubmit={createProject}>
                    <span className="pj-section-label">ETAPA 1 DE 4</span>
                    <h2>Dados do projeto</h2>
                    <p className="pj-setup-intro">
                      Essas preferências serão usadas na apresentação dos
                      dashboards e relatórios e poderão ser editadas depois.
                    </p>
                    <ProjectDetailsFields teams={data.teams} includeTeam />
                    {formError ? <FieldMessage error>{formError}</FieldMessage> : null}
                    <div className="pj-actions">
                      <button type="button" onClick={() => navigate({})}>
                        Cancelar
                      </button>
                      <button
                        className="accent"
                        disabled={busy || !data.teams.length}
                      >
                        {busy ? "Criando…" : "Criar e continuar"}
                      </button>
                    </div>
                    {!data.teams.length ? (
                      <div className="pj-warning" role="alert">
                        Você precisa de uma equipe antes de criar um projeto.{" "}
                        <a href="/new-workspace">Criar minha equipe</a>
                      </div>
                    ) : null}
                  </form>
                </section>
              </div>
            ) : onboardingValue && project && staff ? (
              <ProjectSetupFlow
                project={project}
                step={onboardingStep}
                teamName={selectedTeam?.name ?? "Equipe responsável"}
                members={data.projectMembers}
                clientAccess={data.clientAccess}
                invitations={data.clientInvitations}
                connection={data.projectMetaConnection}
                ifoodConnection={data.projectIfoodConnection}
                canManageAccess={canManageAccess}
                canConfigureIntegration={staff}
                canUnlink={canManageAccess}
                busy={busy}
                notice={notice}
                integrationSearch={search}
                onIntegrationSearch={setSearch}
                onStep={navigateSetup}
                onSaveDetails={saveSetupDetails}
                onManageTeam={() => setTeam(true)}
                onInvite={inviteClient}
                onRevokeAccess={revokeClient}
                onRevokeInvitation={revokeInvitation}
                onConnect={() => void openMeta()}
                onTest={() => void testMetaConnection()}
                onUnlink={() => void unlinkMetaConnection()}
                onIfoodConnected={(connection) =>
                  setData((current) => ({
                    ...current,
                    projectIfoodConnection: connection,
                  }))
                }
                onAdvance={advanceSetup}
                onFinish={finishSetup}
                onExit={() => navigate({ project: cid })}
              />
            ) : creating && project && staff ? (
              <AnalysisWizard
                cid={cid}
                clientName={project.name}
                kind={creating === "report" ? "report" : "dashboard"}
                templates={docs.filter(
                  (d) =>
                    d.kind === "template" &&
                    data.staffClientIds.includes(d.client_id),
                )}
                busy={busy}
                onCancel={() => navigate({ project: cid })}
                onCreate={createDocument}
              />
            ) : cid && !project ? (
              <Empty title="Projeto indisponível" />
            ) : project ? (
              <>
                <nav className="pj-project-tabs" aria-label="Áreas do projeto">
                  <div className="pj-project-tab-group">
                    {[
                      ["overview", "Visão geral"],
                      ["dashboards", "Dashboards"],
                      ["reports", "Relatórios"],
                      ["integrations", "Integrações"],
                      ["automations", "Automações"],
                      ["timeline", "Linha do tempo"],
                      ["goals", "Metas"],
                    ]
                      .filter(
                        ([key]) => staff || !["integrations", "automations"].includes(key),
                      )
                      .map(([key, label]) => (
                        <button
                          key={key}
                          className={view === key ? "active" : ""}
                          aria-current={view === key ? "page" : undefined}
                          onClick={() => navigate({ project: cid, view: key })}
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                  {staff ? (
                    <div
                      className="pj-project-tab-group pj-project-tab-settings"
                      aria-label="Configurações do projeto"
                    >
                      {[
                        ["settings", "Dados do projeto"],
                        ["access", "Equipe e acesso"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={view === key ? "active" : ""}
                          aria-current={view === key ? "page" : undefined}
                          onClick={() => navigate({ project: cid, view: key })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </nav>
                {(view === "overview" || view === "dashboards" || view === "reports") && (
                  <ProjectOverviewView
                    view={view}
                    project={project}
                    staff={staff}
                    search={search}
                    visibleProjectDocs={visibleProjectDocs}
                    legacyReports={legacyReports}
                    automationRecords={data.records.filter((record) => record.kind === "automation" && record.client_id === cid)}
                    metaConnected={data.projectMetaConnection?.connection_status === "connected"}
                    canCreateDocumentFromScreen={canCreateDocumentFromScreen}
                    onSearch={setSearch}
                    onOpen={(documentId) => navigate({ project: cid, document: documentId })}
                    onOpenLegacy={(legacyDocumentId) => navigate({ project: cid, view: "reports", legacyDocument: legacyDocumentId })}
                    onContinueSetup={navigateSetup}
                    onCreateDashboard={() => newDocument("dashboard")}
                    onGoToIntegrations={() => navigate({ project: cid, view: "integrations" })}
                  />
                )}
                {view === "integrations" && (
                  <div className="pj-project-section">
                    <div className="pj-section-heading">
                      <div>
                        <span className="pj-section-label">DADOS DO PROJETO</span>
                        <h2>Integrações de {project.name}</h2>
                        <p>
                          O status abaixo reflete a conexão real deste projeto,
                          não apenas uma autorização aberta no navegador.
                        </p>
                      </div>
                    </div>
                    <ProjectIntegrations
                      project={project}
                      connection={data.projectMetaConnection}
                      ifoodConnection={data.projectIfoodConnection}
                      canConfigure={staff}
                      canUnlink={canManageAccess}
                      busy={busy}
                      search={search}
                      onSearch={setSearch}
                      onConnect={() => void openMeta()}
                      onTest={() => void testMetaConnection()}
                      onUnlink={() => void unlinkMetaConnection()}
                      onIfoodConnected={(connection) =>
                        setData((current) => ({
                          ...current,
                          projectIfoodConnection: connection,
                        }))
                      }
                    />
                    <div className="pj-actions">
                      <button onClick={() => navigate({ project: cid })}>
                        Voltar ao projeto
                      </button>
                      <button
                        className="accent"
                        disabled={
                          data.projectMetaConnection?.connection_status !==
                          "connected"
                        }
                        onClick={() => newDocument("dashboard")}
                      >
                        Criar dashboard
                      </button>
                    </div>
                  </div>
                )}
                {view === "settings" && (
                  <form
                    className="pj-settings-form"
                    key={project.id + project.name}
                    onSubmit={projectSettings}
                  >
                    <span className="pj-section-label">PREFERÊNCIAS DO PROJETO</span>
                    <h2>Dados do projeto</h2>
                    <p className="pj-setup-intro">
                      Atualize a identificação e os formatos usados nas análises
                      deste cliente.
                    </p>
                    <ProjectDetailsFields project={project} />
                    {formError ? <FieldMessage error>{formError}</FieldMessage> : null}
                    <button className="accent" disabled={busy}>
                      {busy ? "Salvando…" : "Salvar preferências"}
                    </button>
                  </form>
                )}
                {view === "automations" && staff && (
                  <ProjectAutomationsView clientId={cid} clientName={project.name} canManage={canManageAccess} />
                )}
                {view === "access" && (
                  <ProjectAccessPanel
                    teamName={selectedTeam?.name ?? "Equipe responsável"}
                    members={data.projectMembers}
                    clientAccess={data.clientAccess}
                    invitations={data.clientInvitations}
                    canManage={canManageAccess}
                    busy={busy}
                    onManageTeam={() => setTeam(true)}
                    onInvite={inviteClient}
                    onRevokeAccess={revokeClient}
                    onRevokeInvitation={revokeInvitation}
                  />
                )}
                {(view === "timeline" || view === "goals") && (
                  <ProjectTimelineGoalsView
                    view={view}
                    staff={staff}
                    records={data.records.filter(
                      (r) => r.client_id === cid && r.kind === (view === "timeline" ? "timeline" : "goal"),
                    )}
                    onCreate={() => setModal(view === "timeline" ? "timeline" : "goal")}
                    onUpdateGoal={setGoalId}
                  />
                )}
              </>
            ) : view === "overview" ? (
              <WorkspaceOverviewView
                data={data}
                docs={docs}
                legacyDocs={legacyDocs}
                onOpen={(clientId, documentId) => navigate({ project: clientId, document: documentId })}
              />
            ) : view === "templates" ? (
              <WorkspaceTemplatesView
                docs={docs}
                search={search}
                onSearch={setSearch}
                onOpen={(clientId, documentId) => navigate({ project: clientId, document: documentId })}
              />
            ) : view === "team" ? (
              <WorkspaceTeamView
                isStaff={data.isStaff}
                teams={data.teams}
                selectedTeamId={selectedTeamId}
                hasSelectedTeam={Boolean(selectedTeam)}
                onSelectTeam={(teamId) => navigate({ view: "team", team: teamId })}
                onManageTeam={() => setTeam(true)}
              />
            ) : (
              <WorkspaceProjectsView
                filtered={filtered}
                docs={docs}
                legacyDocs={legacyDocs}
                search={search}
                sort={sort}
                isStaff={data.isStaff}
                lastActivity={latest}
                onSearch={setSearch}
                onSort={setSort}
                onOpen={(clientId) => navigate({ project: clientId })}
              />
            )}
          </main>
        </>
      )}
      <footer className="pj-footer">
        LAOS · Projetos, resultados e decisões.
      </footer>
      </div>
      {team && <TeamSettingsModal
        open={team}
        teamId={selectedTeamId}
        onClose={() => {
          setTeam(false);
          void reload().catch(e => setNotice(e.message));
        }}
      />}
      {goalId && (
        <GoalUpdateDialog
          busy={busy}
          defaultActual={data.records.find((r) => r.id === goalId)?.payload.actual ?? 0}
          onClose={() => setGoalId("")}
          onSubmit={(actual) =>
            void run(async () => {
              await request("/api/projects", { action: "progress", client_id: cid, id: goalId, actual });
              setGoalId("");
            })
          }
        />
      )}
      {modal === "meta" && (
        <WorkspaceMetaModal
          projectName={project?.name}
          projectId={cid}
          onboardingValue={onboardingValue}
          busy={busy}
          metaLoading={metaLoading}
          metaError={metaError}
          meta={meta}
          accountSearch={accountSearch}
          account={account}
          notice={notice}
          onClose={() => setModal("")}
          onRetry={() => void openMeta()}
          onSearchAccount={setAccountSearch}
          onSelectAccount={setAccount}
          onBind={() => void bind()}
        />
      )}
      {(modal === "goal" || modal === "timeline") && (
        <RecordCreateDialog
          kind={modal}
          busy={busy}
          onClose={() => setModal("")}
          onSubmit={(f) =>
            void run(async () => {
              await request("/api/projects", {
                action: "record",
                value: {
                  client_id: cid,
                  kind: modal,
                  title: f.get("title"),
                  visibility: f.get("visibility"),
                  payload: {
                    description: f.get("description"),
                    ...(modal === "goal"
                      ? {
                          metric: f.get("metric"),
                          target: Number(f.get("target")),
                          actual: Number(f.get("actual")),
                          deadline: f.get("deadline"),
                          direction: "above",
                        }
                      : {}),
                  },
                },
              });
              setModal("");
            })
          }
        />
      )}
      {toast ? <Toast message={toast} close={() => setToast("")} /> : null}
    </div>
  );
}
