/* eslint-disable @next/next/no-img-element */
"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgencyData, AgencyClient, AgencyRecord } from "@/lib/agency/types";
import type { MetaIntegrationStatus } from "@/lib/types";
import type { AnalysisConfig, ProjectDocument } from "@/lib/projects/model";
import { workspaceHref, type WorkspaceView } from "@/lib/projects/routes";
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
import { ProjectIntegrations } from "./project-integrations";
import { ProjectSetupFlow } from "./project-setup-flow";
import { Dialog, Empty, MetaMark, shortDate } from "./ui";
import "./projects.css";
const viewLabels: Record<WorkspaceView, string> = {
  projects: "Projetos",
  overview: "Visão geral",
  dashboards: "Dashboards",
  reports: "Relatórios",
  integrations: "Integrações",
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
  isStaff: false,
  userName: "",
};
export function ProjectsWorkspace({
  initialProjectId = "",
  initialView = "projects",
}: {
  initialProjectId?: string;
  initialView?: WorkspaceView;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const cid = initialProjectId || (initialView === "templates" ? params.get("project") ?? "" : ""),
    view = initialView,
    docId = params.get("document") ?? "",
    legacyDocId = params.get("legacyDocument") ?? "",
    creating = params.get("create");
  const [data, setData] = useState(empty),
    [docs, setDocs] = useState<ProjectDocument[]>([]),
    [legacyDocs, setLegacyDocs] = useState<AgencyRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
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
    [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = window.localStorage.getItem("laos-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("laos-theme", next);
      return next;
    });
  };
  const project = data.clients.find((c) => c.id === cid) as
    | AgencyClient
    | undefined;
  const staff = project ? data.staffClientIds.includes(cid) : data.isStaff;
  const projectRole = cid ? data.projectRoles[cid] : undefined;
  const canManageAccess = projectRole === "owner" || projectRole === "manager";
  const onboardingParam = params.get("onboarding");
  const onboardingValue = ["1", "2", "3", "4"].includes(onboardingParam ?? "")
    ? onboardingParam
    : null;
  const onboardingStep = (onboardingValue
    ? Number(onboardingValue)
    : project?.onboarding_step ?? 1) as 1 | 2 | 3 | 4;
  const selectedTeamId = project?.team_id ?? params.get("team") ?? data.teams[0]?.id;
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
    router.push(
      workspaceHref(nextView, {
        projectId: nextProjectId,
        documentId: nextDocumentId,
        legacyDocumentId: values.legacyDocument,
        create: values.create,
        onboarding: values.onboarding,
        preview: values.preview,
        teamId: values.team,
      }),
    );
    setSearch("");
    setNotice("");
  };
  const routeIdentity = JSON.stringify([cid, docId, legacyDocId]);
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
    setData(payload);
    setDocs(payload.documents);
    setLegacyDocs(payload.legacyDocuments);
  }, [cid, docId, legacyDocId, routeIdentity]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    reload(controller.signal)
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const section = document?.kind === "template" ? "templates" : document?.kind === "report" || legacyDocument ? "reports" : document ? "dashboards" : undefined;
    if (section && view !== section) router.replace(workspaceHref(section, {
      projectId: cid,
      documentId: document?.id,
      legacyDocumentId: legacyDocument?.id,
      preview: params.get("preview") ?? undefined,
    }));
  }, [document, legacyDocument, view, router, cid, params]);
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
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
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
    if (params.get("meta")) {
      const reason =
        params.get("meta") === "error"
          ? params.get("reason") || "A autorização não foi concluída."
          : "";
      void openMeta(reason);
      router.replace(
        workspaceHref("integrations", {
          projectId: cid,
          onboarding: onboardingValue ?? undefined,
        }),
      );
    }
  }, [params, cid, router, openMeta, onboardingValue]);
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
      setNotice(
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
      setNotice(firstProjectValidationError(parsed.error));
      return;
    }
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
    await run(async () => {
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
        setNotice(
          action === "template"
            ? "Template salvo na biblioteca da equipe."
            : action === "timeline"
              ? "Documento adicionado ao histórico."
              : "Alterações salvas.",
        );
    });
  }
  async function projectSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = projectDetailsSchema.safeParse(projectDetailsFromForm(f));
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
      setNotice("Projeto atualizado.");
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
    setBusy(true);
    setNotice("");
    try {
      const result = await request("/api/projects", {
        action: "access",
        client_id: cid,
        email,
      });
      await reload();
      setNotice(result.message ?? "Convite salvo.");
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível salvar o convite.",
      );
      return false;
    } finally {
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
      setNotice("Acesso do cliente revogado.");
    });
  }
  async function revokeInvitation(invitationId: string) {
    await run(async () => {
      await request("/api/projects", {
        action: "revoke_invitation",
        client_id: cid,
        invitation_id: invitationId,
      });
      setNotice("Convite cancelado.");
    });
  }
  async function testMetaConnection() {
    setBusy(true);
    setNotice("");
    try {
      await request("/api/projects", {
        action: "test_integration",
        client_id: cid,
      });
      setNotice("Teste concluído: a conta e a leitura de Insights estão disponíveis.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível testar a conexão.",
      );
    } finally {
      await reload().catch(() => undefined);
      setBusy(false);
    }
  }
  async function unlinkMetaConnection() {
    await run(async () => {
      await request("/api/projects", { action: "unlink", client_id: cid });
      setNotice("A conta Meta foi desvinculada somente deste projeto.");
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
    return (
      docs.find((d) => d.client_id === id && d.kind !== "template")
        ?.created_at ??
      data.clients.find((c) => c.id === id)?.created_at ??
      ""
    );
  }
  return (
    <div className={`projects theme-${theme}`}>
      <header className="pj-topnav">
        <button className="pj-brand" onClick={() => navigate({})}>
          <span>◧</span> laos<span className="pj-brand-sub">relatórios</span>
        </button>
        <nav aria-label="Navegação principal">
          <button
            className={!cid && view === "projects" ? "active" : ""}
            onClick={() => navigate({})}
          >
            ♙ Meus projetos
          </button>
          <button
            className={!cid && view === "overview" ? "active" : ""}
            onClick={() => navigate({ view: "overview" })}
          >
            ▤ Overview
          </button>
          {data.isStaff && (
            <button
              className={view === "templates" ? "active" : ""}
              onClick={() => navigate({ view: "templates" })}
            >
              ▦ Templates
            </button>
          )}
          {data.isStaff && (
            <button
              className={view === "team" ? "active" : ""}
              onClick={() => navigate({ view: "team" })}
            >
              ♙ Equipe
            </button>
          )}
        </nav>
        {project ? (
          <span className="pj-active-project" title={`Projeto ativo: ${project.name}`}>
            <span aria-hidden="true">●</span> {project.name}
          </span>
        ) : null}
        <div className="pj-account">
          <button
            className="pj-theme-toggle"
            aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            title={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? "☀ Claro" : "☾ Escuro"}
          </button>
          <span className="pj-small-avatar">
            {data.userName.slice(0, 1).toUpperCase() || "L"}
          </span>
          <span title={`Workspace: ${workspaceLabel}`}>{workspaceLabel}</span>
          <button
            aria-label="Sair"
            onClick={async () => {
              await fetch("/api/auth/signout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            ↗
          </button>
        </div>
      </header>
      {notice && creating !== "project" && !onboardingValue && (
        <div className="pj-notice" role="status">
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {loading ? (
        <main className="pj-container">
          <Empty title="Carregando seus projetos…" />
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
        <>
        <nav className="pj-container pj-breadcrumbs pj-document-breadcrumbs" aria-label="Caminho atual">
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
          initialPreview={params.get("preview") === "1"}
          busy={busy}
          onBack={() => navigate({ project: cid })}
          onAction={documentAction}
        />
        </>
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
                <span className="pj-project-avatar">
                  {project?.logo_url ? (
                    <img src={project.logo_url} alt="" />
                  ) : (
                    (project?.name.slice(0, 1).toUpperCase() ??
                    (view === "templates" ? "▦" : "L"))
                  )}
                </span>
                <div>
                  {cid && (
                    <button className="pj-back" onClick={() => navigate({})}>
                      ← Voltar para meus projetos
                    </button>
                  )}
                  <h1>
                    {creating === "project"
                      ? "Novo projeto"
                      : creating
                        ? creating === "dashboard"
                          ? "Novo dashboard"
                          : "Novo relatório"
                        : project
                          ? project.name
                          : !cid && view === "overview"
                            ? "Overview da agência"
                            : view === "templates"
                              ? "Meus templates"
                              : view === "team"
                                ? "Equipe e configurações"
                              : "Meus projetos"}
                  </h1>
                </div>
              </div>
              {!cid && !creating && data.isStaff && view === "projects" && (
                <button
                  className="accent"
                  onClick={() => navigate({ create: "project" })}
                >
                  ＋ Novo projeto
                </button>
              )}
              {cid && !creating && staff && !onboardingValue && (
                <div className="pj-inline-actions">
                  <button onClick={() => newDocument("dashboard")}>
                    ◴ Criar dashboard
                  </button>
                  <button
                    className="accent"
                    onClick={() => newDocument("report")}
                  >
                    ▤ Criar relatório
                  </button>
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
                  {view !== "overview" ? (
                    <>
                      <span aria-hidden="true">/</span>
                      <span aria-current="page">
                        {viewLabels[view]}
                      </span>
                    </>
                  ) : null}
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
                    {notice ? (
                      <div className="pj-warning" role="alert">
                        {notice}
                      </div>
                    ) : null}
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
                  {[
                    ["overview", "Visão geral"],
                    ["dashboards", "Dashboards"],
                    ["reports", "Relatórios"],
                    ["integrations", "Integrações"],
                    ["timeline", "Linha do tempo"],
                    ["goals", "Metas"],
                    ["settings", "Dados do projeto"],
                    ["access", "Equipe e acesso"],
                  ]
                    .filter(
                      ([key]) =>
                        staff ||
                        !["integrations", "settings", "access"].includes(key),
                    )
                    .map(([key, label]) => (
                      <button
                        key={key}
                        className={view === key ? "active" : ""}
                        onClick={() => navigate({ project: cid, view: key })}
                      >
                        {label}
                      </button>
                    ))}
                </nav>
                {view === "overview" &&
                staff &&
                !project.onboarding_completed_at ? (
                  <section className="pj-setup-resume" aria-labelledby="setup-resume-title">
                    <div>
                      <span className="pj-section-label">CONFIGURAÇÃO PENDENTE</span>
                      <h2 id="setup-resume-title">
                        Continue preparando {project.name}
                      </h2>
                      <p>
                        O projeto foi preservado. Retome na etapa{" "}
                        {project.onboarding_step} de 4 para testar a integração e
                        criar a primeira análise.
                      </p>
                    </div>
                    <button
                      className="accent"
                      onClick={() =>
                        navigateSetup(
                          Math.min(
                            Math.max(project.onboarding_step, 1),
                            4,
                          ) as 1 | 2 | 3 | 4,
                        )
                      }
                    >
                      Continuar configuração
                    </button>
                  </section>
                ) : null}
                {(view === "overview" || view === "dashboards" || view === "reports") && (
                  <>
                    <div className="pj-list-toolbar">
                      <input
                        className="pj-search"
                        placeholder={
                          view === "dashboards"
                            ? "Buscar dashboard…"
                            : view === "reports"
                              ? "Buscar relatório…"
                              : "Buscar dashboard ou relatório…"
                        }
                        aria-label="Buscar documento"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span>{visibleProjectDocs.length} documentos</span>
                    </div>
                    <div className="pj-document-grid">
                      {visibleProjectDocs
                        .filter((d) =>
                          d.title.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((d) => (
                          <button
                            key={d.id}
                            className="pj-document-card"
                            onClick={() =>
                              navigate({ project: cid, document: d.id })
                            }
                          >
                            <span className={"pj-document-icon " + d.kind}>
                              {d.kind === "dashboard" ? "◴" : "▤"}
                            </span>
                            <div>
                              <span className="pj-section-label">
                                {d.kind === "dashboard"
                                  ? "DASHBOARD"
                                  : "RELATÓRIO"}
                              </span>
                              <h3>{d.title}</h3>
                              <p>
                                {shortDate(d.config.since)} a{" "}
                                {shortDate(d.config.until)}
                              </p>
                              <small>
                                {d.config.metrics.length} indicadores ·{" "}
                                {d.status === "published"
                                  ? "Publicado para o cliente"
                                  : "Rascunho da equipe"}
                              </small>
                            </div>
                            <span>→</span>
                          </button>
                        ))}
                      {view === "reports" &&
                        legacyReports
                          .filter((record) =>
                            record.title.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((record) => (
                            <button className="pj-document-card pj-legacy-document" key={record.id} onClick={() => navigate({ project: cid, view: "reports", legacyDocument: record.id })}>
                              <span className="pj-document-icon report">▤</span>
                              <div>
                                <span className="pj-section-label">RELATÓRIO LEGADO PRESERVADO</span>
                                <h3>{record.title}</h3>
                                <p>{shortDate(record.created_at)}</p>
                                <small>
                                  {record.status === "published" ? "Publicado" : "Rascunho"} · somente leitura
                                </small>
                              </div>
                            </button>
                          ))}
                    </div>
                    {!visibleProjectDocs.length && !(view === "reports" && legacyReports.length) && (
                      <Empty title="Tudo pronto para sua primeira análise">
                        <p>
                          {data.projectMetaConnection?.connection_status ===
                          "connected"
                            ? "Escolha um modelo, defina o período e gere os resultados deste cliente."
                            : "Conecte a conta Meta para começar a gerar dashboards e relatórios."}
                        </p>
                        {staff && (
                          <button
                            className="accent"
                            onClick={() =>
                              data.projectMetaConnection?.connection_status ===
                              "connected"
                                ? newDocument("dashboard")
                                : navigate({
                                    project: cid,
                                    view: "integrations",
                                  })
                            }
                          >
                            {data.projectMetaConnection?.connection_status ===
                            "connected"
                              ? "Criar dashboard"
                              : "Conectar integração"}
                          </button>
                        )}
                      </Empty>
                    )}
                    {view === "overview" && data.records.some((record) => record.kind === "automation" && record.client_id === cid) ? (
                      <section className="pj-panel">
                        <h2>Planejamentos históricos de automação</h2>
                        <p className="pj-muted">Configurações legadas preservadas. Não há execução ou envio automático nesta etapa.</p>
                        {data.records.filter((record) => record.kind === "automation" && record.client_id === cid).map((record) => (
                          <details key={record.id} className="pj-history-item">
                            <summary>{record.title} · {record.status === "paused" ? "Pausado" : record.status}</summary>
                            <pre>{JSON.stringify(record.payload, null, 2)}</pre>
                          </details>
                        ))}
                      </section>
                    ) : null}
                  </>
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
                      canConfigure={staff}
                      canUnlink={canManageAccess}
                      busy={busy}
                      search={search}
                      onSearch={setSearch}
                      onConnect={() => void openMeta()}
                      onTest={() => void testMetaConnection()}
                      onUnlink={() => void unlinkMetaConnection()}
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
                    <button className="accent" disabled={busy}>
                      {busy ? "Salvando…" : "Salvar preferências"}
                    </button>
                  </form>
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
                  <section className="pj-panel">
                    <div className="pj-list-toolbar">
                      <h2>
                        {view === "timeline"
                          ? "Linha do tempo"
                          : "Metas do projeto"}
                      </h2>
                      {staff && (
                        <button
                          className="accent"
                          onClick={() =>
                            setModal(view === "timeline" ? "timeline" : "goal")
                          }
                        >
                          ＋{" "}
                          {view === "timeline"
                            ? "Registrar ação"
                            : "Criar meta"}
                        </button>
                      )}
                    </div>
                    {data.records
                      .filter(
                        (r) =>
                          r.client_id === cid &&
                          r.kind ===
                            (view === "timeline" ? "timeline" : "goal"),
                      )
                      .map((r) => (
                        <article className="pj-history-item" key={r.id}>
                          <small>
                            {shortDate(r.created_at)} ·{" "}
                            {r.visibility === "shared"
                              ? "Compartilhado"
                              : "Interno"}
                          </small>
                          <h3>{r.title}</h3>
                          <p>{r.payload.description}</p>
                          {r.kind === "goal" && (
                            <div><p>
                              {r.payload.metric}: {r.payload.actual ?? 0} /{" "}
                              {r.payload.target} · Prazo:{" "}
                              {r.payload.deadline
                                ? shortDate(r.payload.deadline)
                                : "—"}
                            </p>{staff && <button onClick={() => setGoalId(r.id)}>Atualizar realizado</button>}</div>
                          )}
                        </article>
                      ))}
                    {!data.records.some(
                      (r) =>
                        r.client_id === cid &&
                        r.kind === (view === "timeline" ? "timeline" : "goal"),
                    ) && (
                      <Empty
                        title={
                          view === "timeline"
                            ? "O histórico deste projeto começa aqui"
                            : "Defina os objetivos deste cliente"
                        }
                      >
                        <p>Os registros ficam organizados dentro do projeto.</p>
                      </Empty>
                    )}
                  </section>
                )}
              </>
            ) : view === "overview" ? (
              <>
                <div className="pj-overview-grid">
                  {[
                    ["Projetos", data.clients.length],
                    [
                      "Dashboards",
                      docs.filter((d) => d.kind === "dashboard").length,
                    ],
                    [
                      "Relatórios publicados",
                      docs.filter(
                          (d) => d.kind === "report" && d.status === "published",
                        ).length + legacyDocs.filter((record) => record.status === "published").length,
                    ],
                    [
                      "Contas Meta vinculadas",
                      data.clients.filter((c) => c.meta_account_id).length,
                    ],
                  ].map(([label, value]) => (
                    <article className="pj-panel" key={label}>
                      <p>{label}</p>
                      <strong>{value}</strong>
                    </article>
                  ))}
                </div>
                <section className="pj-panel">
                  <h2>Últimas entregas</h2>
                  {docs
                    .filter((d) => d.kind !== "template")
                    .slice(0, 10)
                    .map((d) => (
                      <button
                        className="pj-overview-row"
                        key={d.id}
                        onClick={() =>
                          navigate({ project: d.client_id, document: d.id })
                        }
                      >
                        <strong>{d.title}</strong>
                        <span>
                          {data.clients.find((c) => c.id === d.client_id)?.name}
                        </span>
                        <small>{shortDate(d.updated_at)}</small>
                        <span>→</span>
                      </button>
                    ))}
                  <p className="pj-muted">
                    Visão das entregas da agência. Indicadores de plataformas
                    diferentes permanecem separados por projeto.
                  </p>
                </section>
              </>
            ) : view === "templates" ? (
              <>
                <div className="pj-list-toolbar">
                  <input
                    className="pj-search"
                    placeholder="Buscar template…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Buscar template da equipe"
                  />
                </div>
                <div className="pj-document-grid">
                  {docs
                    .filter(
                      (d) =>
                        d.kind === "template" &&
                        d.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((d) => (
                      <button
                        className="pj-document-card"
                        key={d.id}
                        onClick={() =>
                          navigate({ project: d.client_id, document: d.id })
                        }
                      >
                        <span className="pj-document-icon">▦</span>
                        <div>
                          <h3>{d.title}</h3>
                          <p>
                            {d.config.metrics.length} indicadores ·{" "}
                            {d.config.sections.length} blocos
                          </p>
                          <small>Modelo reutilizável da equipe</small>
                        </div>
                      </button>
                    ))}
                </div>
                {!docs.some((d) => d.kind === "template") && (
                  <Empty title="Sua biblioteca de templates">
                    <p>
                      Monte uma análise e escolha “Salvar como template”. O
                      modelo ficará disponível ao criar documentos em outros
                      projetos.
                    </p>
                  </Empty>
                )}
              </>
            ) : view === "team" ? (
              <section className="pj-panel pj-team-settings">
                <span className="pj-section-label">WORKSPACE DA AGÊNCIA</span>
                <h2>Equipe e configurações</h2>
                <p>
                  Convide gestores e operadores e defina as permissões da equipe responsável pelos projetos.
                </p>
                {data.isStaff ? (
                  <>
                  <label>Workspace
                    <select value={selectedTeamId ?? ""} onChange={(event) => navigate({ view: "team", team: event.target.value })}>
                      {!selectedTeam ? <option value={selectedTeamId ?? ""} disabled>Workspace indisponível</option> : null}
                      {data.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <button className="accent" disabled={!selectedTeam} onClick={() => setTeam(true)}>
                    Gerenciar membros e convites
                  </button>
                  </>
                ) : (
                  <p className="pj-muted">
                    Seu acesso é de cliente. Apenas a equipe da agência pode gerenciar membros.
                  </p>
                )}
              </section>
            ) : (
              <>
                <div className="pj-list-toolbar">
                  <input
                    className="pj-search"
                    placeholder="Buscar projeto…"
                    aria-label="Buscar projeto"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <label className="pj-sort">
                    Ordenar por
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Último documento criado</option>
                      <option value="name">Nome do projeto</option>
                    </select>
                  </label>
                  {data.isStaff && (
                    <button onClick={() => navigate({ view: "team" })}>
                      ♙ Gerenciar equipe
                    </button>
                  )}
                </div>
                <div className="pj-project-grid">
                  {filtered.map((c) => {
                    const documents = docs.filter(
                      (d) => d.client_id === c.id && d.kind !== "template",
                    );
                    return (
                      <button
                        className="pj-project-card"
                        key={c.id}
                        onClick={() => navigate({ project: c.id })}
                      >
                        <span className="pj-project-avatar">
                          {c.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <h3>{c.name}</h3>
                          <div className="pj-card-integrations">
                            {c.meta_account_id ? (
                              <MetaMark />
                            ) : (
                              <small>Nenhuma integração</small>
                            )}
                          </div>
                          <p>
                            {
                              documents.filter((d) => d.kind === "dashboard")
                                .length
                            }{" "}
                            dashboards ·{" "}
                            {
                              documents.filter((d) => d.kind === "report")
                                .length + legacyDocs.filter((record) => record.client_id === c.id).length
                            }{" "}
                            relatórios
                          </p>
                          <small>
                            {documents.length ? (
                              <>
                                Última análise em{" "}
                                <b>{shortDate(documents[0].created_at)}</b>
                              </>
                            ) : (
                              "Conecte as fontes para criar sua primeira análise"
                            )}
                          </small>
                        </div>
                        <span className="pj-card-arrow">→</span>
                      </button>
                    );
                  })}
                </div>
                {!filtered.length && (
                  <Empty
                    title={
                      search
                        ? "Nenhum projeto encontrado"
                        : "Seus projetos aparecem aqui"
                    }
                  >
                    <p>
                      {data.isStaff
                        ? "Crie um projeto para cada cliente e organize suas análises."
                        : "A agência precisa liberar o acesso aos seus projetos. Se você é gestor, crie sua equipe para começar."}
                    </p>
                    {!data.isStaff && (
                      <a className="pj-button" href="/new-workspace">
                        Criar minha equipe
                      </a>
                    )}
                  </Empty>
                )}
              </>
            )}
          </main>
        </>
      )}
      <footer className="pj-footer">
        LAOS · Projetos, resultados e decisões.
      </footer>
      {team && <TeamSettingsModal
        open={team}
        teamId={selectedTeamId}
        onClose={() => {
          setTeam(false);
          void reload().catch(e => setNotice(e.message));
        }}
      />}
      {goalId && <Dialog title="Atualizar meta" close={() => setGoalId("")}>
        <form onSubmit={e => {e.preventDefault(); const actual = Number(new FormData(e.currentTarget).get("actual")); void run(async () => {await request("/api/projects", {action:"progress", client_id:cid, id:goalId, actual}); setGoalId("");});}}>
          <label>Valor realizado<input name="actual" type="number" min="0" step="any" required defaultValue={data.records.find(r => r.id === goalId)?.payload.actual ?? 0}/></label>
          <div className="pj-actions"><button type="button" onClick={() => setGoalId("")}>Cancelar</button><button disabled={busy} className="primary">Salvar</button></div>
        </form>
      </Dialog>}
      {modal === "meta" && (
        <Dialog title="Conectar Meta Ads" close={() => setModal("")} wide>
          <p>
            Selecione a conta de anúncios que pertence a{" "}
            <strong>{project?.name}</strong>.
          </p>
          {metaLoading ? (
            <div className="pj-empty pj-empty-compact" role="status">
              <MetaMark />
              <h3>Consultando sua autorização Meta…</h3>
              <p>Estamos carregando as contas disponíveis.</p>
            </div>
          ) : metaError ? (
            <div className="pj-warning" role="alert">
              <strong>Não foi possível carregar as contas.</strong>
              <p>{metaError}</p>
              <button type="button" onClick={() => void openMeta()}>
                Tentar novamente
              </button>
            </div>
          ) : meta?.stage === "connected" || meta?.stage === "needs_selection" ? (
            <>
              <label className="pj-search-label">
                Buscar conta de anúncios
                <input
                  className="pj-search"
                  type="search"
                  placeholder="Nome ou ID da conta"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                />
              </label>
              <div
                className="pj-account-grid"
                role="radiogroup"
                aria-label="Contas de anúncios disponíveis"
              >
                {meta.accounts
                  .filter((a) =>
                    (a.name + " " + a.id)
                      .toLowerCase()
                      .includes(accountSearch.toLowerCase()),
                  )
                  .map((a) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={account === a.id}
                      className={
                        "pj-source " + (account === a.id ? "selected" : "")
                      }
                      key={a.id}
                      onClick={() => setAccount(a.id)}
                    >
                      <MetaMark />
                      <div>
                        <strong>{a.name}</strong>
                        <small>{a.id}</small>
                        <small>
                          {[a.currency, a.timezoneName, "Status " + a.status]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </div>
                      {account === a.id && <span>✓</span>}
                    </button>
                  ))}
              </div>
              {!meta.accounts.some((a) =>
                (a.name + " " + a.id)
                  .toLowerCase()
                  .includes(accountSearch.toLowerCase()),
              ) ? (
                <div className="pj-empty pj-empty-compact">
                  <h3>Nenhuma conta encontrada</h3>
                  <p>
                    Confira a pesquisa ou autorize outro usuário Meta que tenha
                    acesso à conta.
                  </p>
                </div>
              ) : null}
              <div className="pj-actions">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href =
                      "/api/integrations/meta/start?returnTo=" +
                      encodeURIComponent(
                        workspaceHref("integrations", {
                          projectId: cid,
                          onboarding: onboardingValue ?? undefined,
                        }),
                      );
                  }}
                >
                  Autorizar outras contas
                </button>
                <button
                  type="button"
                  className="accent"
                  disabled={busy || !account}
                  onClick={() => void bind()}
                >
                  {busy ? "Vinculando…" : "Vincular ao projeto"}
                </button>
              </div>
            </>
          ) : (
            <div className="pj-empty">
              <MetaMark />
              <h3>Autorize o acesso pelo Facebook</h3>
              <p>
                {meta?.error ??
                  "Depois da autorização, você volta para escolher a conta deste projeto."}
              </p>
              <button
                type="button"
                className="primary"
                disabled={meta?.stage === "missing_config"}
                onClick={() => {
                  window.location.href =
                    "/api/integrations/meta/start?returnTo=" +
                    encodeURIComponent(
                      workspaceHref("integrations", {
                        projectId: cid,
                        onboarding: onboardingValue ?? undefined,
                      }),
                    );
                }}
              >
                Continuar com o Facebook
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="pj-warning">
              {notice}
            </p>
          )}
        </Dialog>
      )}
      {(modal === "goal" || modal === "timeline") && (
        <Dialog
          title={modal === "goal" ? "Nova meta" : "Registrar ação"}
          close={() => setModal("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
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
              });
            }}
          >
            <label>
              Título
              <input name="title" required maxLength={180} />
            </label>
            {modal === "goal" && (
              <>
                <label>
                  Indicador
                  <input
                    name="metric"
                    required
                    placeholder="Ex.: Compras no site"
                  />
                </label>
                <div className="pj-form-row">
                  <label>
                    Meta
                    <input
                      name="target"
                      type="number"
                      min="0.01"
                      step="any"
                      required
                    />
                  </label>
                  <label>
                    Realizado
                    <input
                      name="actual"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue="0"
                      required
                    />
                  </label>
                </div>
                <label>
                  Prazo
                  <input name="deadline" type="date" required />
                </label>
              </>
            )}
            <label>
              Descrição
              <textarea name="description" rows={4} />
            </label>
            <label>
              Visibilidade
              <select name="visibility">
                <option value="internal">Interno da equipe</option>
                <option value="shared">Compartilhado com o cliente</option>
              </select>
            </label>
            <button className="accent" disabled={busy}>
              Salvar
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
