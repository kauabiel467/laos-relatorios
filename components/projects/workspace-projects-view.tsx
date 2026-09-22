import type { AgencyClient, AgencyRecord } from "@/lib/agency/types";
import type { ProjectDocument } from "@/lib/projects/model";
import { Empty, MetaMark, shortDate } from "./ui";
import { InterfaceIcon } from "./interface-icon";

export function WorkspaceProjectsView({
  filtered,
  docs,
  legacyDocs,
  search,
  sort,
  isStaff,
  lastActivity,
  onSearch,
  onSort,
  onOpen,
}: {
  filtered: AgencyClient[];
  docs: ProjectDocument[];
  legacyDocs: AgencyRecord[];
  search: string;
  sort: string;
  isStaff: boolean;
  lastActivity: (clientId: string) => string | undefined;
  onSearch: (value: string) => void;
  onSort: (value: string) => void;
  onOpen: (clientId: string) => void;
}) {
  return (
    <>
      <div className="pj-list-toolbar">
        <input
          className="pj-search"
          placeholder="Buscar projeto…"
          aria-label="Buscar projeto"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <label className="pj-sort">
          Ordenar por
          <select value={sort} onChange={(e) => onSort(e.target.value)}>
            <option value="recent">Último documento criado</option>
            <option value="name">Nome do projeto</option>
          </select>
        </label>
        <span className="pj-result-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "projeto" : "projetos"}
        </span>
      </div>
      <div className="pj-project-grid">
        {filtered.map((c) => {
          const documents = docs.filter((d) => d.client_id === c.id && d.kind !== "template");
          const dashboardCount = documents.filter((d) => d.kind === "dashboard").length;
          const reportCount =
            documents.filter((d) => d.kind === "report").length +
            legacyDocs.filter((record) => record.client_id === c.id).length;
          const activity = lastActivity(c.id);
          const status = c.meta_account_id
            ? { label: "Meta conectada", tone: "connected" }
            : c.onboarding_completed_at
              ? { label: "Sem integração", tone: "unavailable" }
              : { label: "Configuração pendente", tone: "beta" };
          return (
            <button
              className="pj-project-card"
              key={c.id}
              aria-label={`Abrir projeto ${c.name}`}
              onClick={() => onOpen(c.id)}
            >
              <span className="pj-project-avatar">{c.name.slice(0, 1).toUpperCase()}</span>
              <div className="pj-project-card-content">
                <div className="pj-project-card-heading">
                  <h3>{c.name}</h3>
                  <span className={`pj-status-badge ${status.tone}`}>{status.label}</span>
                </div>
                <div className="pj-card-integrations">
                  {c.meta_account_id ? (
                    <span className="pj-integration-pill">
                      <MetaMark />
                      Meta Ads
                    </span>
                  ) : (
                    <small>Nenhuma fonte conectada</small>
                  )}
                </div>
                <div className="pj-project-card-meta">
                  <span>{dashboardCount} dashboards</span>
                  <span>{reportCount} relatórios</span>
                </div>
                <div className="pj-project-card-footer">
                  <small>
                    Última atividade <b>{activity ? shortDate(activity) : "indisponível"}</b>
                  </small>
                  <span className="pj-open-project">
                    Abrir projeto <InterfaceIcon name="forward" size={18} />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!filtered.length && (
        <Empty title={search ? "Nenhum projeto encontrado" : "Seus projetos aparecem aqui"}>
          <p>
            {isStaff
              ? "Crie um projeto para cada cliente e organize suas análises."
              : "A agência precisa liberar o acesso aos seus projetos. Se você é gestor, crie sua equipe para começar."}
          </p>
          {!isStaff && (
            <a className="pj-button" href="/new-workspace">
              Criar minha equipe
            </a>
          )}
        </Empty>
      )}
    </>
  );
}
