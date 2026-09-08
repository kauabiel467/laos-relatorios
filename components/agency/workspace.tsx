"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  AgencyClient,
  AgencyData,
  AgencyRecord,
} from "@/lib/agency/types";
import type { MetaIntegrationStatus } from "@/lib/types";
import "./workspace.css";
const menu = [
  ["home", "Visão geral", "grid"],
  ["clients", "Clientes", "users"],
  ["reports", "Relatórios", "file"],
  ["goals", "Metas e alertas", "target"],
  ["timeline", "Linha do tempo", "clock"],
  ["integrations", "Integrações", "link"],
  ["automations", "Automações", "repeat"],
  ["settings", "Configurações", "settings"],
] as const;
const initial: AgencyData = {
  clients: [],
  records: [],
  teams: [],
  staffClientIds: [],
  userName: "",
  isStaff: false,
};
const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
const number = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n);
const date = (v: string) =>
  new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR");
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6",
    target: "M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l9-9 M16 3h5v5",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
    repeat: "M3 7h15l-4-4 M21 17H6l4 4 M18 7l3 3 M6 17l-3-3",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
    search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    plus: "M12 5v14 M5 12h14",
    alert: "M12 3L2 21h20z M12 9v5 M12 17v1",
    check: "M4 12l5 5L20 6",
  };
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ag-empty">
      <span className="ag-empty-icon">
        <Icon name="grid" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function AgencyWorkspace() {
  const router = useRouter(),
    params = useSearchParams();
  const view = params.get("view") ?? "home",
    clientId = params.get("client") ?? "";
  const [data, setData] = useState<AgencyData>(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [dialog, setDialog] = useState(""),
    [saving, setSaving] = useState(false),
    [report, setReport] = useState<AgencyRecord | null>(null),
    [meta, setMeta] = useState<MetaIntegrationStatus | null>(null);
  const reload = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/agency", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!dialog && !report) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".ag-modal");
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),a[href],input,select,textarea",
        ) ?? [],
      );
    focusable()[0]?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        setDialog("");
        setReport(null);
      }
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [dialog, report, saving]);
  const client = data.clients.find((c) => c.id === clientId);
  const staff = client ? data.staffClientIds.includes(client.id) : data.isStaff;
  const records = data.records.filter(
    (r) => !client || r.client_id === client.id,
  );
  const goals = records.filter((r) => r.kind === "goal");
  const alerts = goals.filter(
    (r) =>
      r.status === "active" &&
      (r.payload.direction === "below"
        ? Number(r.payload.actual ?? 0) > Number(r.payload.target)
        : r.payload.deadline &&
          r.payload.deadline < new Date().toISOString().slice(0, 10) &&
          Number(r.payload.actual ?? 0) < Number(r.payload.target)),
  );
  const reports = records.filter((r) => r.kind === "report");
  const snapshot = records.find((r) => r.kind === "snapshot");
  const filteredClients = useMemo(
    () =>
      data.clients.filter((c) =>
        `${c.name} ${c.unit} ${c.segment}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.clients, search],
  );
  function navigate(v: string, id = clientId) {
    router.push(
      "/?" +
        new URLSearchParams({
          view: v,
          ...(id ? { client: id } : {}),
        }).toString(),
    );
    setSearch("");
  }
  async function mutate(body: unknown) {
    setSaving(true);
    setNotice("");
    try {
      const r = await fetch("/api/agency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const p = await r.json();
      if (!r.ok) throw Error(p.error);
      await reload();
      setNotice("Alterações salvas.");
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "");
    let body: unknown;
    if (dialog === "client")
      body = {
        action: "client",
        value: {
          name: val("name"),
          team_id: val("team"),
          segment: val("segment"),
          unit: val("unit"),
          contact_email: val("email"),
        },
      };
    else if (dialog === "access")
      body = { action: "access", client_id: clientId, email: val("email") };
    else if (dialog === "meta")
      body = {
        action: "meta",
        client_id: clientId,
        account_id: val("account"),
      };
    else if (dialog === "progress")
      body = {
        action: "progress",
        client_id: clientId,
        id: val("goal"),
        actual: Number(val("actual")),
      };
    else
      body = {
        action: "record",
        value: {
          client_id: clientId,
          kind: dialog,
          title: val("title"),
          visibility: val("visibility") || "internal",
          payload: {
            description: val("description"),
            ...(dialog === "goal"
              ? {
                  metric: val("metric"),
                  target: Number(val("target")),
                  actual: Number(val("actual")),
                  direction: val("direction"),
                  deadline: val("deadline"),
                }
              : {}),
            ...(dialog === "automation" ? { cadence: val("cadence") } : {}),
          },
        },
      };
    if (await mutate(body)) setDialog("");
  }
  async function connectMeta() {
    setNotice("");
    try {
      const r = await fetch("/api/integrations/meta/status");
      const m = await r.json();
      if (!r.ok) throw Error(m.error);
      setMeta(m);
      setDialog("meta");
    } catch {
      setNotice("Não foi possível consultar a conexão Meta.");
    }
  }
  const add = (kind: string, label: string) => (
    <button className="ag-button primary" onClick={() => setDialog(kind)}>
      <Icon name="plus" />
      {label}
    </button>
  );
  const clientName = (id: string) =>
    data.clients.find((c) => c.id === id)?.name ?? "Cliente";
  const title = client
    ? view === "home"
      ? "Visão geral"
      : (menu.find((x) => x[0] === view)?.[1] ?? "Resultados")
    : view === "home"
      ? data.isStaff
        ? "Sua operação, em perspectiva."
        : "Seu negócio, em perspectiva."
      : (menu.find((x) => x[0] === view)?.[1] ?? "Visão geral");
  return (
    <div className="agency">
      <aside className="ag-sidebar">
        <Link href="/" className="ag-brand">
          <span>L</span>LAOS<b>workspace</b>
        </Link>
        <div className="ag-agency-label">
          {data.isStaff ? "ÁREA DA AGÊNCIA" : "PORTAL DO CLIENTE"}
        </div>
        <nav aria-label="Navegação principal">
          {menu
            .filter(
              (x) =>
                data.isStaff ||
                !["automations", "settings", "integrations"].includes(x[0]),
            )
            .map(([key, label, icon]) => (
              <button
                key={key}
                className={view === key ? "selected" : ""}
                onClick={() => navigate(key, "")}
              >
                <Icon name={icon} />
                {key === "clients" && !data.isStaff ? "Meus negócios" : label}
                {key === "goals" && alerts.length > 0 ? (
                  <span className="ag-count">{alerts.length}</span>
                ) : null}
              </button>
            ))}
        </nav>
        <div className="ag-sidebar-bottom">
          <span className="ag-avatar">
            {data.userName.slice(0, 2).toUpperCase() || "LA"}
          </span>
          <div>
            <strong>{data.userName || "LAOS"}</strong>
            <small>
              {data.isStaff ? "Gestão da agência" : "Acesso pessoal"}
            </small>
          </div>
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
      </aside>
      <div className="ag-main">
        <header className="ag-topbar">
          <div className="ag-breadcrumb">
            <button onClick={() => navigate("home", "")}>
              {data.isStaff ? "Agência" : "Meu portal"}
            </button>
            <span>/</span>
            <strong>{client?.name ?? "Visão da carteira"}</strong>
          </div>
          <label className="ag-search">
            <Icon name="search" />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar cliente, unidade…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span className="ag-top-date">
            {new Date().toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
            })}
          </span>
        </header>
        <main className="ag-content">
          {client && (
            <div className="ag-client-context">
              <button
                className="ag-back"
                onClick={() => navigate("clients", "")}
              >
                ← Todos os clientes
              </button>
              <span>
                {client.segment} · {client.unit}
              </span>
            </div>
          )}
          <div className="ag-heading">
            <div>
              <div className="ag-eyebrow">
                {client ? client.name : "CENTRAL DE RESULTADOS"}
              </div>
              <h1>{title}</h1>
              <p>
                {client
                  ? "Resultados, decisões e próximos passos em um só lugar."
                  : "Acompanhe seus clientes e organize o que precisa da sua atenção."}
              </p>
            </div>
            {staff && view === "clients" && !client
              ? add("client", "Novo cliente")
              : staff && client && view === "reports"
                ? add("report", "Criar relatório")
                : staff && client && view === "goals"
                  ? add("goal", "Nova meta")
                  : staff && client && view === "timeline"
                    ? add("timeline", "Registrar ação")
                    : staff && client && view === "automations"
                      ? add("automation", "Planejar automação")
                      : data.isStaff && !client && view === "home"
                        ? add("client", "Novo cliente")
                        : null}
          </div>
          {client && (
            <nav className="ag-client-tabs" aria-label="Áreas do cliente">
              {menu
                .filter(
                  (x) =>
                    x[0] !== "clients" &&
                    (staff ||
                      !["settings", "automations", "integrations"].includes(
                        x[0],
                      )),
                )
                .map(([key, label]) => (
                  <button
                    key={key}
                    className={view === key ? "selected" : ""}
                    onClick={() => navigate(key)}
                  >
                    {label}
                  </button>
                ))}
            </nav>
          )}
          {notice && (
            <div className="ag-notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Fechar aviso">
                ×
              </button>
            </div>
          )}
          {loading ? (
            <div className="ag-loading" role="status">
              Carregando sua carteira…
            </div>
          ) : error ? (
            <div className="ag-error" role="alert">
              <h3>Não conseguimos carregar sua área</h3>
              <p>{error}</p>
              <button className="ag-button" onClick={() => void reload()}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {clientId && !client ? (
                <Empty
                  title="Cliente indisponível"
                  description="Esse cliente não está disponível para sua conta."
                />
              ) : null}
              {search ? (
                <section className="ag-panel">
                  <h2>
                    Resultados da busca <span>{filteredClients.length}</span>
                  </h2>
                  <ClientList
                    clients={filteredClients}
                    records={data.records}
                    open={(id) => navigate("home", id)}
                  />
                </section>
              ) : null}
              {!search && (view === "home" || view === "clients") && (
                <>
                  {view === "home" && (
                    <div className="ag-stats">
                      <Stat
                        label={
                          client ? "Fontes com dados" : "Clientes na carteira"
                        }
                        value={
                          client
                            ? String(
                                new Set(
                                  records
                                    .filter((r) => r.kind === "snapshot")
                                    .map((r) => r.payload.source),
                                ).size,
                              )
                            : String(data.clients.length)
                        }
                        detail={
                          client
                            ? "Atualizações salvas"
                            : "Negócios acompanhados"
                        }
                        icon="users"
                      />
                      <Stat
                        label="Metas em acompanhamento"
                        value={String(
                          goals.filter((r) => r.status === "active").length,
                        )}
                        detail="Objetivos definidos"
                        icon="target"
                      />
                      <Stat
                        label="Relatórios publicados"
                        value={String(
                          reports.filter((r) => r.status === "published")
                            .length,
                        )}
                        detail="Disponíveis para consulta"
                        icon="file"
                      />
                      <Stat
                        label="Precisam de atenção"
                        value={String(alerts.length)}
                        detail="Metas fora do limite ou vencidas"
                        icon="alert"
                      />
                    </div>
                  )}
                  {client ? (
                    <>
                      <section className="ag-panel">
                        <div className="ag-section-head">
                          <div>
                            <h2>Resultados do cliente</h2>
                            <p>
                              {snapshot
                                ? `${snapshot.payload.source} · ${snapshot.payload.period} · Atualizado em ${date(snapshot.created_at)}`
                                : "Conecte uma fonte para acompanhar os resultados reais."}
                            </p>
                          </div>
                          {staff && (
                            <button
                              className="ag-button"
                              onClick={() => navigate("integrations")}
                            >
                              Gerenciar fontes <Icon name="arrow" />
                            </button>
                          )}
                        </div>
                        {snapshot?.payload.bundle ? (
                          <>
                            <Metrics record={snapshot} />
                            <div className="ag-callout">
                              Receita atribuída pela Meta. Estes valores não
                              representam, por si só, a receita total do
                              negócio.
                            </div>
                            {staff && (
                              <Link
                                className="ag-button"
                                href={"/traffic?client=" + client.id}
                              >
                                Abrir análise de tráfego <Icon name="arrow" />
                              </Link>
                            )}
                          </>
                        ) : (
                          <Empty
                            title="Seu próximo passo: conectar os resultados"
                            description="Nenhum número de demonstração será exibido. As métricas aparecerão após a primeira atualização."
                            action={
                              staff ? (
                                <button
                                  className="ag-button primary"
                                  onClick={() => navigate("integrations")}
                                >
                                  Configurar integrações
                                </button>
                              ) : undefined
                            }
                          />
                        )}
                      </section>
                      <div className="ag-two">
                        <section className="ag-panel">
                          <h2>Últimas ações</h2>
                          <Timeline
                            records={records
                              .filter((r) => r.kind === "timeline")
                              .slice(0, 4)}
                          />
                        </section>
                        <section className="ag-panel">
                          <h2>Metas do negócio</h2>
                          <Goals records={goals.slice(0, 4)} />
                        </section>
                      </div>
                    </>
                  ) : (
                    <>
                      <section className="ag-panel">
                        <div className="ag-section-head">
                          <div>
                            <h2>
                              Seus clientes <span>{data.clients.length}</span>
                            </h2>
                            <p>
                              Escolha um negócio para acessar os resultados e a
                              operação.
                            </p>
                          </div>
                          <span className="ag-badge neutral">
                            {data.teams.length > 1
                              ? `${data.teams.length} equipes`
                              : "Carteira de clientes"}
                          </span>
                        </div>
                        <ClientList
                          clients={data.clients}
                          records={data.records}
                          open={(id) => navigate("home", id)}
                        />
                        {!data.clients.length && (
                          <Empty
                            title="Sua carteira começa aqui"
                            description={
                              data.isStaff
                                ? "Cadastre seu primeiro cliente e organize as fontes, metas e entregas."
                                : "Se você é cliente, peça à agência para liberar seu acesso. Se é gestor, crie sua equipe para começar."
                            }
                            action={
                              data.isStaff ? (
                                add("client", "Cadastrar primeiro cliente")
                              ) : (
                                <Link
                                  className="ag-button primary"
                                  href="/new-workspace"
                                >
                                  Criar minha equipe
                                </Link>
                              )
                            }
                          />
                        )}
                      </section>
                      <div className="ag-two">
                        <section className="ag-panel">
                          <h2>Precisa da sua atenção</h2>
                          {alerts.length ? (
                            alerts.map((a) => (
                              <button
                                key={a.id}
                                className="ag-alert-row"
                                onClick={() => navigate("goals", a.client_id)}
                              >
                                <Icon name="alert" />
                                <span>
                                  <strong>{a.title}</strong>
                                  <small>{clientName(a.client_id)}</small>
                                </span>
                                <Icon name="arrow" />
                              </button>
                            ))
                          ) : (
                            <p className="ag-soft-empty">
                              Nenhuma meta vencida ou acima do limite. Novas
                              pendências aparecerão aqui.
                            </p>
                          )}
                        </section>
                        <section className="ag-panel">
                          <h2>Últimas entregas</h2>
                          {reports.slice(0, 4).map((r) => (
                            <button
                              className="ag-alert-row"
                              key={r.id}
                              onClick={() => setReport(r)}
                            >
                              <Icon name="file" />
                              <span>
                                <strong>{r.title}</strong>
                                <small>
                                  {clientName(r.client_id)} ·{" "}
                                  {date(r.created_at)}
                                </small>
                              </span>
                              <span className="ag-badge neutral">
                                {r.status === "published"
                                  ? "Publicado"
                                  : "Rascunho"}
                              </span>
                            </button>
                          ))}
                          {!reports.length && (
                            <p className="ag-soft-empty">
                              Os relatórios criados para seus clientes serão
                              reunidos aqui.
                            </p>
                          )}
                        </section>
                      </div>
                    </>
                  )}
                </>
              )}
              {!search && view === "reports" && (
                <section className="ag-panel">
                  {!reports.length ? (
                    <Empty
                      title="Nenhum relatório por aqui"
                      description={
                        client
                          ? "Crie um rascunho, revise a análise e publique para o cliente."
                          : "Selecione um cliente para criar o primeiro relatório."
                      }
                    />
                  ) : (
                    reports.map((r) => (
                      <div className="ag-record-row" key={r.id}>
                        <span className="ag-file-icon">
                          <Icon name="file" />
                        </span>
                        <div>
                          <h3>{r.title}</h3>
                          <p>
                            {clientName(r.client_id)} · {date(r.created_at)}
                          </p>
                        </div>
                        <span
                          className={
                            "ag-badge " +
                            (r.status === "published" ? "good" : "neutral")
                          }
                        >
                          {r.status === "published" ? "Publicado" : "Rascunho"}
                        </span>
                        <button
                          className="ag-button"
                          onClick={() => setReport(r)}
                        >
                          Abrir
                        </button>
                        {data.staffClientIds.includes(r.client_id) &&
                          r.status === "draft" && (
                            <button
                              className="ag-button primary"
                              disabled={saving}
                              onClick={() =>
                                void mutate({
                                  action: "status",
                                  client_id: r.client_id,
                                  id: r.id,
                                })
                              }
                            >
                              Publicar
                            </button>
                          )}
                      </div>
                    ))
                  )}
                </section>
              )}
              {!search && view === "goals" && (
                <section className="ag-panel">
                  <div className="ag-section-head">
                    <div>
                      <h2>Metas e indicadores</h2>
                      <p>
                        Valores acompanhados manualmente nesta versão. Atualize
                        o realizado para avaliar os alertas.
                      </p>
                    </div>
                    {staff && client && goals.length > 0 && (
                      <button
                        className="ag-button"
                        onClick={() => setDialog("progress")}
                      >
                        Atualizar realizado
                      </button>
                    )}
                  </div>
                  <Goals records={goals} />
                  {!goals.length && (
                    <Empty
                      title="Defina a direção do resultado"
                      description={
                        client
                          ? "Cadastre uma meta com valor, prazo e indicador."
                          : "Abra um cliente para definir metas."
                      }
                    />
                  )}
                </section>
              )}
              {!search && view === "timeline" && (
                <section className="ag-panel">
                  <h2>Histórico de ações</h2>
                  <Timeline
                    records={records.filter((r) => r.kind === "timeline")}
                  />
                  {!records.some((r) => r.kind === "timeline") && (
                    <Empty
                      title="Uma história construída com cada ação"
                      description={
                        client
                          ? "Registre campanhas, reuniões e decisões. Escolha o que compartilhar com o cliente."
                          : "As ações registradas nos clientes aparecerão nesta linha do tempo."
                      }
                    />
                  )}
                </section>
              )}
              {!search && view === "integrations" && (
                <>
                  <div className="ag-integration-grid">
                    <Integration
                      title="Meta Ads"
                      letter="∞"
                      description="Campanhas, investimento e resultados de Facebook e Instagram."
                      status={
                        client?.meta_account_id
                          ? "Conta vinculada"
                          : "Disponível"
                      }
                    >
                      <button
                        className="ag-button primary"
                        disabled={!client || saving}
                        onClick={() => void connectMeta()}
                      >
                        {client?.meta_account_id
                          ? "Atualizar / vincular conta"
                          : "Conectar conta"}
                      </button>
                    </Integration>
                    <Integration
                      title="Cardápio digital"
                      letter="C"
                      description="Pedidos, receita e ticket médio do seu canal próprio."
                      status="Fornecedor a definir"
                    >
                      <p>
                        Selecione abaixo o fornecedor utilizado. A integração
                        depende de acesso à API oficial.
                      </p>
                    </Integration>
                    <Integration
                      title="Marketplace"
                      letter="M"
                      description="Acompanhe vendas e pedidos de canais como iFood."
                      status="Em planejamento"
                    >
                      <p>
                        Disponibilidade e métricas serão confirmadas com o
                        fornecedor.
                      </p>
                    </Integration>
                  </div>
                  {!client && (
                    <div className="ag-callout">
                      Abra um cliente para vincular as fontes ao negócio
                      correto.
                    </div>
                  )}
                  {client && (
                    <section className="ag-panel">
                      <h2>Próximas integrações deste cliente</h2>
                      <p>
                        Registre o fornecedor e os dados necessários no
                        histórico interno para planejar a conexão.
                      </p>
                      {staff && add("timeline", "Registrar necessidade")}
                    </section>
                  )}
                </>
              )}
              {!search && view === "automations" && (
                <section className="ag-panel">
                  <h2>Planejamento de automações</h2>
                  <p>
                    Defina as rotinas desejadas. Os agendamentos ficam pausados
                    até configurar o processamento e o canal de entrega.
                  </p>
                  {records
                    .filter((r) => r.kind === "automation")
                    .map((r) => (
                      <div className="ag-record-row" key={r.id}>
                        <Icon name="repeat" />
                        <div>
                          <h3>{r.title}</h3>
                          <p>
                            {clientName(r.client_id)} ·{" "}
                            {r.payload.cadence === "weekly"
                              ? "Semanal"
                              : "Mensal"}
                          </p>
                        </div>
                        <span className="ag-badge neutral">
                          Aguardando ativação
                        </span>
                      </div>
                    ))}
                  {!records.some((r) => r.kind === "automation") && (
                    <Empty
                      title="Planeje suas próximas entregas"
                      description={
                        client
                          ? "Cadastre a frequência e as instruções da rotina. E-mail e WhatsApp ainda não enviam automaticamente."
                          : "Selecione um cliente para planejar suas rotinas."
                      }
                    />
                  )}
                </section>
              )}
              {!search && view === "settings" && (
                <div className="ag-two">
                  <section className="ag-panel">
                    <h2>Equipe da agência</h2>
                    <p>
                      Gerencie os membros e papéis que acessam sua operação.
                    </p>
                    <Link className="ag-button" href="/traffic?settings=team">
                      Gerenciar equipe
                    </Link>
                    <div className="ag-divider" />
                    {data.teams.map((t) => (
                      <p key={t.id}>
                        <strong>{t.name}</strong>
                      </p>
                    ))}
                  </section>
                  <section className="ag-panel">
                    <h2>Acesso do cliente</h2>
                    <p>
                      O cliente precisa criar e confirmar sua conta no mesmo
                      endereço de login. Depois, um proprietário ou gerente pode
                      liberar o acesso ao negócio.
                    </p>
                    {client ? (
                      add("access", "Liberar acesso por e-mail")
                    ) : (
                      <p className="ag-callout">
                        Selecione um cliente para administrar seu acesso.
                      </p>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="ag-footer">
            <span>LAOS · Gestão de resultados</span>
            <span>Dados reais. Contexto claro.</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <div
          className="ag-modal-backdrop"
          onClick={() => !saving && setDialog("")}
        >
          <section
            className="ag-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ag-section-head">
              <h2 id="form-title">
                {
                  {
                    client: "Novo cliente",
                    goal: "Nova meta",
                    timeline: "Registrar ação",
                    report: "Criar relatório",
                    automation: "Planejar automação",
                    access: "Liberar acesso",
                    meta: "Conectar Meta Ads",
                    progress: "Atualizar meta",
                  }[dialog]
                }
              </h2>
              <button
                className="ag-close"
                aria-label="Fechar"
                onClick={() => setDialog("")}
              >
                ×
              </button>
            </div>
            <form onSubmit={submit}>
              {dialog === "client" ? (
                <>
                  <Field name="name" label="Nome do cliente" required />
                  <label>
                    Equipe
                    <select name="team" required>
                      {data.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="ag-form-grid">
                    <Field
                      name="segment"
                      label="Segmento"
                      defaultValue="Restaurante / Delivery"
                      required
                    />
                    <Field
                      name="unit"
                      label="Unidade"
                      defaultValue="Unidade principal"
                      required
                    />
                  </div>
                  <Field
                    name="email"
                    label="E-mail de contato (opcional)"
                    type="email"
                  />
                  <p className="ag-form-help">
                    Este cadastro não envia convites nem libera acesso
                    automaticamente.
                  </p>
                </>
              ) : dialog === "access" ? (
                <>
                  <Field
                    name="email"
                    label="E-mail da conta confirmada do cliente"
                    type="email"
                    required
                  />
                  <p className="ag-form-help">
                    Acesso de leitura apenas a este cliente, relatórios
                    publicados e ações compartilhadas.
                  </p>
                </>
              ) : dialog === "progress" ? (
                <>
                  <label>
                    Meta
                    <select name="goal" required>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    name="actual"
                    label="Valor realizado"
                    type="number"
                    required
                  />
                </>
              ) : dialog === "meta" ? (
                <>
                  {meta?.stage === "connected" ? (
                    <>
                      <label>
                        Conta autorizada
                        <select name="account" required>
                          {meta.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="ag-form-help">
                        Importar os últimos 30 dias e compartilhar os resultados
                        com os usuários autorizados deste cliente.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Autorize sua conta Meta e selecione as contas de
                        anúncios no painel de conexão.
                      </p>
                      <Link
                        className="ag-button primary"
                        href={"/traffic?client=" + clientId + "&connect=meta"}
                      >
                        Autorizar com a Meta
                      </Link>
                      <p className="ag-form-help">
                        Depois de autorizar, volte aqui para vincular a conta ao
                        cliente.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Field
                    name="title"
                    label={dialog === "goal" ? "Nome da meta" : "Título"}
                    required
                  />
                  {dialog === "goal" && (
                    <>
                      <label>
                        Indicador
                        <select name="metric">
                          <option>Pedidos</option>
                          <option>Receita (R$)</option>
                          <option>Investimento (R$)</option>
                          <option>Custo por resultado (R$)</option>
                          <option>ROAS</option>
                          <option>Leads</option>
                          <option>Conversas</option>
                        </select>
                      </label>
                      <div className="ag-form-grid">
                        <Field
                          name="target"
                          label="Valor da meta"
                          type="number"
                          required
                        />
                        <Field
                          name="actual"
                          label="Realizado até agora"
                          type="number"
                          defaultValue="0"
                          required
                        />
                      </div>
                      <label>
                        Objetivo
                        <select name="direction">
                          <option value="above">
                            Alcançar ou superar a meta
                          </option>
                          <option value="below">Manter abaixo do limite</option>
                        </select>
                      </label>
                      <Field
                        name="deadline"
                        label="Prazo"
                        type="date"
                        required
                      />
                    </>
                  )}
                  {dialog === "automation" && (
                    <label>
                      Frequência
                      <select name="cadence">
                        <option value="weekly">Semanal</option>
                        <option value="monthly">Mensal</option>
                      </select>
                    </label>
                  )}
                  <label>
                    {dialog === "report" ? "Análise do gestor" : "Descrição"}
                    <textarea name="description" rows={4} maxLength={12000} />
                  </label>
                  {dialog !== "automation" && (
                    <label>
                      Visibilidade
                      <select name="visibility">
                        <option value="internal">Interno da agência</option>
                        <option value="shared">
                          Compartilhado com o cliente
                        </option>
                      </select>
                    </label>
                  )}
                  {dialog === "report" && (
                    <p className="ag-form-help">
                      O rascunho preserva a última atualização salva da Meta.
                      Revise a data e os números antes de publicar.
                    </p>
                  )}
                </>
              )}
              {notice && (
                <p className="ag-form-help" role="status">
                  {notice}
                </p>
              )}
              {!(dialog === "meta" && meta?.stage !== "connected") && (
                <div className="ag-form-actions">
                  <button
                    type="button"
                    className="ag-button"
                    onClick={() => setDialog("")}
                  >
                    Cancelar
                  </button>
                  <button className="ag-button primary" disabled={saving}>
                    {saving
                      ? "Salvando…"
                      : dialog === "meta"
                        ? "Importar resultados"
                        : "Salvar"}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      )}
      {report && (
        <div className="ag-modal-backdrop">
          <section
            className="ag-modal ag-report"
            role="dialog"
            aria-modal="true"
            aria-label="Relatório"
          >
            <div className="ag-report-toolbar">
              <button className="ag-button" onClick={() => window.print()}>
                Imprimir / salvar PDF
              </button>
              <button
                className="ag-close"
                aria-label="Fechar relatório"
                onClick={() => setReport(null)}
              >
                ×
              </button>
            </div>
            <article className="ag-report-sheet">
              <div className="ag-eyebrow">LAOS · RELATÓRIO DE RESULTADOS</div>
              <h1>{report.title}</h1>
              <p>
                {clientName(report.client_id)} · {date(report.created_at)} ·{" "}
                {report.status === "published" ? "Publicado" : "Rascunho"}
              </p>
              {report.payload.bundle ? (
                <>
                  <p>
                    Fonte: {report.payload.source} · {report.payload.period} ·
                    Atualização:{" "}
                    {date(
                      String(report.payload.synced_at ?? report.created_at),
                    )}
                  </p>
                  <Metrics record={report} />
                  <p>
                    Receita atribuída pela Meta. Não somar à receita de outras
                    fontes.
                  </p>
                </>
              ) : (
                <p>Este relatório não contém métricas importadas.</p>
              )}
              <h2>Análise e próximos passos</h2>
              <p className="ag-preserve">
                {report.payload.description || "Nenhuma análise registrada."}
              </p>
            </article>
          </section>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label>
      {label}
      <input
        {...props}
        autoComplete="off"
        min={props.type === "number" ? 0 : undefined}
        step={props.type === "number" ? "any" : undefined}
      />
    </label>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <div className="ag-stat">
      <div>
        <span>{label}</span>
        <Icon name={icon} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function ClientList({
  clients,
  records,
  open,
}: {
  clients: AgencyClient[];
  records: AgencyRecord[];
  open: (id: string) => void;
}) {
  return (
    <div className="ag-client-list">
      {clients.map((c) => {
        const latest = records.find(
          (r) => r.client_id === c.id && r.kind === "snapshot",
        );
        return (
          <button
            className="ag-client-row"
            key={c.id}
            onClick={() => open(c.id)}
          >
            <span className="ag-client-avatar">
              {c.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="ag-client-name">
              <strong>{c.name}</strong>
              <small>
                {c.segment} · {c.unit}
              </small>
            </span>
            <span className={"ag-badge " + (latest ? "good" : "neutral")}>
              {latest ? "Meta · dados salvos" : "Aguardando conexão"}
            </span>
            <span className="ag-client-updated">
              {latest ? date(latest.created_at) : "Sem atualização"}
            </span>
            <Icon name="arrow" />
          </button>
        );
      })}
    </div>
  );
}
function Metrics({ record }: { record: AgencyRecord }) {
  const s = record.payload.bundle?.snapshot;
  if (!s) return null;
  return (
    <div className="ag-metrics">
      {[
        ["Investimento", currency(s.spend)],
        [s.resultLabel, number(s.resultValue)],
        ["Receita atribuída", currency(s.revenue)],
        ["ROAS", number(s.roas) + "x"],
      ].map(([l, v]) => (
        <div key={l}>
          <span>{l}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
function Goals({ records }: { records: AgencyRecord[] }) {
  return (
    <div className="ag-goals">
      {records.map((g) => {
        const p = g.payload,
          actual = Number(p.actual ?? 0),
          target = Number(p.target ?? 0);
        const achieved =
          p.direction === "below" ? actual <= target : actual >= target;
        return (
          <div className="ag-goal" key={g.id}>
            <div>
              <h3>{g.title}</h3>
              <span className={"ag-badge " + (achieved ? "good" : "neutral")}>
                {achieved
                  ? p.direction === "below"
                    ? "Dentro do limite"
                    : "Meta atingida"
                  : "Em acompanhamento"}
              </span>
            </div>
            <p>
              {p.metric} · Prazo:{" "}
              {p.deadline ? date(p.deadline) : "Não definido"}
            </p>
            <div className="ag-progress">
              <span
                style={{
                  width:
                    Math.min(target ? (actual / target) * 100 : 0, 100) + "%",
                  background: achieved ? "#149778" : "#4365e7",
                }}
              />
            </div>
            <div>
              <strong>
                {number(actual)} <small>/ {number(target)}</small>
              </strong>
              <small>Atualização manual</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Timeline({ records }: { records: AgencyRecord[] }) {
  return (
    <div className="ag-timeline">
      {records.map((r) => (
        <div key={r.id}>
          <span className="ag-timeline-dot" />
          <small>
            {date(r.created_at)} ·{" "}
            {r.visibility === "shared" ? "Compartilhado" : "Interno"}
          </small>
          <h3>{r.title}</h3>
          <p className="ag-preserve">{r.payload.description}</p>
        </div>
      ))}
    </div>
  );
}
function Integration({
  title,
  letter,
  description,
  status,
  children,
}: {
  title: string;
  letter: string;
  description: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ag-panel ag-integration">
      <span className="ag-integration-icon">{letter}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <span className="ag-badge neutral">{status}</span>
      <div className="ag-divider" />
      {children}
    </section>
  );
}
