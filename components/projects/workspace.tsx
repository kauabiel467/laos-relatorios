/* eslint-disable @next/next/no-img-element */
"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgencyData, AgencyClient } from "@/lib/agency/types";
import type { MetaIntegrationStatus } from "@/lib/types";
import type { AnalysisConfig, ProjectDocument } from "@/lib/projects/model";
import { TeamSettingsModal } from "@/components/dashboard/team-settings-modal";
import { AnalysisWizard } from "./wizard";
import { AnalysisView } from "./analysis-view";
import { Dialog, Empty, MetaMark, shortDate } from "./ui";
import "./projects.css";
const empty: AgencyData = {
  clients: [],
  records: [],
  teams: [],
  staffClientIds: [],
  isStaff: false,
  userName: "",
};
const integrations = [
  {
    id: "meta",
    name: "Meta Ads",
    icon: "∞",
    color: "#0967d9",
    description: "Anúncios de Facebook e Instagram",
    available: true,
  },
  {
    id: "instagram",
    name: "Instagram Business",
    icon: "◎",
    color: "#cf43a0",
    description: "Conteúdo e perfil orgânico",
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: "f",
    color: "#2379df",
    description: "Conteúdo e página orgânica",
  },
  {
    id: "google_ads",
    name: "Google Ads",
    icon: "A",
    color: "#33a56b",
    description: "Anúncios na pesquisa e na rede Google",
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    icon: "▥",
    color: "#ed9638",
    description: "Eventos e navegação no site",
  },
  {
    id: "ifood",
    name: "iFood",
    icon: "iF",
    color: "#ed3948",
    description: "Pedidos do marketplace",
  },
  {
    id: "cardapio",
    name: "Cardápio digital",
    icon: "C",
    color: "#744abd",
    description: "Pedidos do canal próprio",
  },
  {
    id: "google_business",
    name: "Google Meu Negócio",
    icon: "G",
    color: "#277cc9",
    description: "Presença local e avaliações",
  },
];
export function ProjectsWorkspace() {
  const router = useRouter(),
    params = useSearchParams();
  const cid = params.get("project") ?? "",
    view = params.get("view") ?? "projects",
    docId = params.get("document") ?? "",
    creating = params.get("create");
  const [data, setData] = useState(empty),
    [docs, setDocs] = useState<ProjectDocument[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent"),
    [team, setTeam] = useState(false),
    [modal, setModal] = useState(""),
    [meta, setMeta] = useState<MetaIntegrationStatus | null>(null),
    [accountSearch, setAccountSearch] = useState(""),
    [account, setAccount] = useState(""),
    [goalId, setGoalId] = useState("");
  const project = data.clients.find((c) => c.id === cid) as
    | (AgencyClient & { logo_url?: string; meta_connected_at?: string })
    | undefined;
  const staff = project ? data.staffClientIds.includes(cid) : data.isStaff;
  const document = docs.find((d) => d.id === docId && d.client_id === cid);
  const projectDocs = docs.filter(
    (d) => d.client_id === cid && d.kind !== "template",
  );
  const navigate = (values: Record<string, string>) => {
    router.push("/?" + new URLSearchParams(values));
    setSearch("");
    setNotice("");
  };
  const reload = useCallback(async () => {
    const responses = await Promise.all([
      fetch("/api/agency", { cache: "no-store" }),
      fetch("/api/projects", { cache: "no-store" }),
    ]);
    const [a, d] = await Promise.all(responses.map((r) => r.json()));
    if (!responses[0].ok || !responses[1].ok) throw Error(a.error ?? d.error);
    setData(a);
    setDocs(d.documents);
  }, []);
  useEffect(() => {
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [reload]);
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
  const openMeta = useCallback(async () => {
    setNotice("");
    try {
      const r = await fetch("/api/integrations/meta/status");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMeta(d);
      setAccount("");
      setModal("meta");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Não foi possível abrir a conexão.",
      );
    }
  }, []);
  useEffect(() => {
    if (params.get("meta")) {
      void openMeta();
      if (params.get("meta") === "error")
        setNotice(params.get("reason") || "A autorização não foi concluída.");
      router.replace("/?project=" + cid + "&view=integrations");
    }
  }, [params, cid, router, openMeta]);
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
        "Conta vinculada. Agora você pode criar um dashboard ou relatório.",
      );
    });
  }
  async function createProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const p = await request("/api/agency", {
        action: "client",
        value: {
          name: f.get("name"),
          team_id: f.get("team"),
          segment: f.get("segment"),
          unit: "Unidade principal",
          contact_email: "",
        },
      });
      navigate({ project: p.id, view: "integrations", onboarding: "1" });
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
      navigate({ project: cid, document: d.id });
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
        navigate({ project: cid, document: d.id });
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
    await run(async () => {
      await request("/api/projects", {
        action: "project",
        client_id: cid,
        value: Object.fromEntries(f),
      });
      setNotice("Projeto atualizado.");
    });
  }
  const newDocument = (kind: string) => {
    if (!project?.meta_account_id) {
      setNotice("Conecte a conta Meta deste projeto antes de gerar a análise.");
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
    <div className="projects">
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
            className={view === "overview" ? "active" : ""}
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
        </nav>
        <div className="pj-account">
          <span className="pj-small-avatar">
            {data.userName.slice(0, 1).toUpperCase() || "L"}
          </span>
          <span>{data.isStaff ? "Minha agência" : "Meu acesso"}</span>
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
      {notice && creating !== "project" && (
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
      ) : docId && project && document ? (
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
      ) : docId ? (
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
                          : view === "overview"
                            ? "Overview da agência"
                            : view === "templates"
                              ? "Meus templates"
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
              {cid && !creating && staff && (
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
            {creating === "project" ? (
              <div className="pj-wizard">
                <aside>
                  <div className="pj-step">1/2</div>
                  <h2>Personalize seu projeto</h2>
                  <p>
                    Um projeto reúne as integrações, dashboards e relatórios de
                    um cliente.
                  </p>
                </aside>
                <form onSubmit={createProject}>
                  <h2>Detalhes do projeto</h2>
                  <label>
                    Nome do projeto
                    <input
                      name="name"
                      placeholder="Ex.: Los Burguer"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Equipe responsável
                    <select name="team" required>
                      {data.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Segmento
                    <input
                      name="segment"
                      defaultValue="Restaurante / Delivery"
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Idioma e formato
                    <input
                      readOnly
                      value="Português do Brasil · DD/MM/AAAA · 1.000,00"
                    />
                  </label>
                  {notice && (
                    <div className="pj-warning" role="alert">
                      {notice}
                    </div>
                  )}
                  <div className="pj-actions">
                    <button type="button" onClick={() => navigate({})}>
                      Cancelar
                    </button>
                    <button
                      className="accent"
                      disabled={busy || !data.teams.length}
                    >
                      {busy ? "Criando…" : "Continuar →"}
                    </button>
                  </div>
                  {!data.teams.length && (
                    <a href="/new-workspace">
                      Crie sua equipe para cadastrar projetos.
                    </a>
                  )}
                </form>
              </div>
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
                    ["projects", "Dashboards e relatórios"],
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
                {view === "projects" && (
                  <>
                    <div className="pj-list-toolbar">
                      <input
                        className="pj-search"
                        placeholder="Buscar dashboard ou relatório…"
                        aria-label="Buscar documento"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <span>{projectDocs.length} documentos</span>
                      {data.records.some(r => r.client_id === cid && r.kind === "report") && <a className="pj-button" href={"/operations?view=reports&client=" + cid}>Relatórios anteriores</a>}
                      {staff && <a className="pj-button" href={"/operations?view=automations&client=" + cid}>Planejamento de automações</a>}
                    </div>
                    <div className="pj-document-grid">
                      {projectDocs
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
                    </div>
                    {!projectDocs.length && (
                      <Empty title="Tudo pronto para sua primeira análise">
                        <p>
                          {project.meta_account_id
                            ? "Escolha um modelo, defina o período e gere os resultados deste cliente."
                            : "Conecte a conta Meta para começar a gerar dashboards e relatórios."}
                        </p>
                        {staff && (
                          <button
                            className="accent"
                            onClick={() =>
                              project.meta_account_id
                                ? newDocument("dashboard")
                                : navigate({
                                    project: cid,
                                    view: "integrations",
                                  })
                            }
                          >
                            {project.meta_account_id
                              ? "Criar dashboard"
                              : "Conectar integração"}
                          </button>
                        )}
                      </Empty>
                    )}
                  </>
                )}
                {view === "integrations" && (
                  <div className="pj-integration-layout">
                    <aside>
                      {params.get("onboarding") && (
                        <div className="pj-step">2/2</div>
                      )}
                      <h2>Integrações</h2>
                      <p>
                        Conecte as contas de <strong>{project.name}</strong>{" "}
                        para coletar os dados das suas análises.
                      </p>
                      <div className="pj-hint">
                        As integrações pertencem ao projeto e podem ser usadas
                        em diferentes dashboards e relatórios.
                      </div>
                    </aside>
                    <section>
                      {project.meta_account_id && (
                        <>
                          <h2>Contas vinculadas</h2>
                          <div className="pj-connected">
                            <MetaMark />
                            <div>
                              <strong>Meta Ads</strong>
                              <p>{project.meta_account_id}</p>
                              <span className="pj-connected-status">
                                Conta vinculada
                              </span>
                            </div>
                            <small>
                              {project.meta_connected_at
                                ? "Integrada em " +
                                  shortDate(project.meta_connected_at)
                                : "Reconecte para habilitar o novo fluxo"}
                            </small>
                            <button
                              disabled={busy}
                              onClick={() => void openMeta()}
                            >
                              Gerenciar
                            </button>
                            <button
                              disabled={busy}
                              aria-label="Desvincular Meta deste projeto"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Desvincular a Meta deste projeto? Os documentos salvos serão preservados.",
                                  )
                                )
                                  void run(async () => {
                                    await request("/api/projects", {
                                      action: "unlink",
                                      client_id: cid,
                                    });
                                  });
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </>
                      )}
                      <h2>Adicionar integração</h2>
                      <input
                        className="pj-search"
                        placeholder="Pesquisar integrações…"
                        aria-label="Pesquisar integrações"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <div className="pj-integration-grid">
                        {integrations
                          .filter((i) =>
                            i.name.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((i) => (
                            <article
                              className={
                                "pj-integration-card " +
                                (i.id === "meta" && project.meta_account_id
                                  ? "connected"
                                  : "")
                              }
                              key={i.id}
                            >
                              <span style={{ background: i.color }}>
                                {i.icon}
                              </span>
                              <h3>{i.name}</h3>
                              <p>{i.description}</p>
                              <small>
                                {i.available
                                  ? project.meta_account_id
                                    ? "1 conta vinculada"
                                    : "Disponível"
                                  : "Em planejamento"}
                              </small>
                              <button
                                disabled={!i.available}
                                onClick={() => void openMeta()}
                              >
                                {i.available
                                  ? "⌁ " +
                                    (project.meta_account_id
                                      ? "Gerenciar"
                                      : "Integrar")
                                  : "Aguardando integração"}
                              </button>
                            </article>
                          ))}
                      </div>
                      <p className="pj-footnote">
                        Meta Ads disponível nesta versão. Os demais canais
                        dependem de implementação e autorização do fornecedor.
                      </p>
                      <div className="pj-actions">
                        <button onClick={() => navigate({ project: cid })}>
                          Voltar ao projeto
                        </button>
                        <button
                          className="accent"
                          disabled={!project.meta_account_id}
                          onClick={() => newDocument("dashboard")}
                        >
                          Criar dashboard →
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                {view === "settings" && (
                  <form
                    className="pj-settings-form"
                    key={project.id + project.name}
                    onSubmit={projectSettings}
                  >
                    <h2>Dados do projeto</h2>
                    <label>
                      Nome
                      <input
                        name="name"
                        defaultValue={project.name}
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </label>
                    <div className="pj-form-row">
                      <label>
                        Segmento
                        <input name="segment" defaultValue={project.segment} />
                      </label>
                      <label>
                        Unidade
                        <input name="unit" defaultValue={project.unit} />
                      </label>
                    </div>
                    <label>
                      E-mail de contato
                      <input
                        name="contact_email"
                        type="email"
                        defaultValue={project.contact_email ?? ""}
                      />
                    </label>
                    <label>
                      Link da logo (HTTPS)
                      <input
                        name="logo_url"
                        type="url"
                        placeholder="https://…"
                        defaultValue={project.logo_url ?? ""}
                      />
                    </label>
                    <p className="pj-muted">
                      A logo aparecerá na capa dos relatórios e no projeto.
                    </p>
                    <button className="accent" disabled={busy}>
                      Salvar projeto
                    </button>
                  </form>
                )}
                {view === "access" && (
                  <div className="pj-settings-grid">
                    <section className="pj-panel">
                      <h2>Equipe da agência</h2>
                      <p>
                        Os membros da equipe responsável podem editar os
                        projetos dessa equipe.
                      </p>
                      <button onClick={() => setTeam(true)}>
                        Gerenciar membros
                      </button>
                    </section>
                    <section className="pj-panel">
                      <h2>Acesso do cliente</h2>
                      <p>
                        Libere o acesso de leitura por e-mail. O cliente precisa
                        ter uma conta confirmada no LAOS.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const email = new FormData(e.currentTarget).get(
                            "email",
                          );
                          void run(async () => {
                            await request("/api/agency", {
                              action: "access",
                              client_id: cid,
                              email,
                            });
                            setNotice(
                              "Acesso de leitura liberado para este projeto.",
                            );
                          });
                        }}
                      >
                        <label>
                          E-mail
                          <input type="email" name="email" required />
                        </label>
                        <button className="accent" disabled={busy}>
                          Liberar acesso
                        </button>
                      </form>
                      <p className="pj-muted">
                        Links exigem login. Rascunhos e templates ficam
                        restritos à agência.
                      </p>
                    </section>
                  </div>
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
                      ).length,
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
                    <button onClick={() => setTeam(true)}>
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
                                .length
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
        onClose={() => {
          setTeam(false);
          void reload().catch(e => setNotice(e.message));
        }}
      />}
      {goalId && <Dialog title="Atualizar meta" close={() => setGoalId("")}>
        <form onSubmit={e => {e.preventDefault(); const actual = Number(new FormData(e.currentTarget).get("actual")); void run(async () => {await request("/api/agency", {action:"progress", client_id:cid, id:goalId, actual}); setGoalId("");});}}>
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
          {meta?.stage === "connected" || meta?.stage === "needs_selection" ? (
            <>
              <input
                className="pj-search"
                aria-label="Buscar conta Meta"
                placeholder="Buscar conta…"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
              />
              <div className="pj-account-grid">
                {meta.accounts
                  .filter((a) =>
                    (a.name + " " + a.id)
                      .toLowerCase()
                      .includes(accountSearch.toLowerCase()),
                  )
                  .map((a) => (
                    <button
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
                      </div>
                      {account === a.id && <span>✓</span>}
                    </button>
                  ))}
              </div>
              <div className="pj-actions">
                <button
                  onClick={() => {
                    window.location.href =
                      "/api/integrations/meta/start?returnTo=" +
                      encodeURIComponent(
                        "/?project=" + cid + "&view=integrations",
                      );
                  }}
                >
                  Autorizar outras contas
                </button>
                <button
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
                className="primary"
                disabled={meta?.stage === "missing_config"}
                onClick={() => {
                  window.location.href =
                    "/api/integrations/meta/start?returnTo=" +
                    encodeURIComponent(
                      "/?project=" + cid + "&view=integrations",
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
                await request("/api/agency", {
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
