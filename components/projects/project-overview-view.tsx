import type { AgencyClient, AgencyRecord } from "@/lib/agency/types";
import type { ProjectDocument } from "@/lib/projects/model";
import { Empty, shortDate } from "./ui";
import { InterfaceIcon } from "./interface-icon";

export function ProjectOverviewView({
  view,
  project,
  staff,
  search,
  visibleProjectDocs,
  legacyReports,
  automationRecords,
  metaConnected,
  canCreateDocumentFromScreen,
  onSearch,
  onOpen,
  onOpenLegacy,
  onContinueSetup,
  onCreateDashboard,
  onGoToIntegrations,
}: {
  view: "overview" | "dashboards" | "reports";
  project: AgencyClient;
  staff: boolean;
  search: string;
  visibleProjectDocs: ProjectDocument[];
  legacyReports: AgencyRecord[];
  automationRecords: AgencyRecord[];
  metaConnected: boolean;
  canCreateDocumentFromScreen: boolean;
  onSearch: (value: string) => void;
  onOpen: (documentId: string) => void;
  onOpenLegacy: (legacyDocumentId: string) => void;
  onContinueSetup: (step: 1 | 2 | 3 | 4) => void;
  onCreateDashboard: () => void;
  onGoToIntegrations: () => void;
}) {
  return (
    <>
      {view === "overview" && staff && !project.onboarding_completed_at ? (
        <section className="pj-setup-resume" aria-labelledby="setup-resume-title">
          <div>
            <span className="pj-section-label">CONFIGURAÇÃO PENDENTE</span>
            <h2 id="setup-resume-title">Continue preparando {project.name}</h2>
            <p>
              O projeto foi preservado. Retome na etapa {project.onboarding_step} de 4
              para testar a integração e criar a primeira análise.
            </p>
          </div>
          <button
            className="accent"
            onClick={() =>
              onContinueSetup(Math.min(Math.max(project.onboarding_step, 1), 4) as 1 | 2 | 3 | 4)
            }
          >
            Continuar configuração
          </button>
        </section>
      ) : null}
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
          onChange={(e) => onSearch(e.target.value)}
        />
        <span>{visibleProjectDocs.length} documentos</span>
      </div>
      <div className="pj-document-grid">
        {visibleProjectDocs
          .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
          .map((d) => (
            <button key={d.id} className="pj-document-card" onClick={() => onOpen(d.id)}>
              <span className={"pj-document-icon " + d.kind}>
                {d.kind === "dashboard" ? "◴" : "▤"}
              </span>
              <div>
                <span className="pj-section-label">
                  {d.kind === "dashboard" ? "DASHBOARD" : "RELATÓRIO"}
                </span>
                <h3>{d.title}</h3>
                <p>
                  {shortDate(d.config.since)} a {shortDate(d.config.until)}
                </p>
                <small>
                  {d.config.metrics.length} indicadores ·{" "}
                  {d.status === "published" ? "Publicado para o cliente" : "Rascunho da equipe"}
                </small>
              </div>
              <InterfaceIcon name="forward" size={18} />
            </button>
          ))}
        {view === "reports" &&
          legacyReports
            .filter((record) => record.title.toLowerCase().includes(search.toLowerCase()))
            .map((record) => (
              <button
                className="pj-document-card pj-legacy-document"
                key={record.id}
                onClick={() => onOpenLegacy(record.id)}
              >
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
            {metaConnected
              ? "Escolha um modelo, defina o período e gere os resultados deste cliente."
              : "Conecte a conta Meta para começar a gerar dashboards e relatórios."}
          </p>
          {staff && !canCreateDocumentFromScreen && (
            <button
              className="accent"
              onClick={() => (metaConnected ? onCreateDashboard() : onGoToIntegrations())}
            >
              {metaConnected ? "Criar dashboard" : "Conectar integração"}
            </button>
          )}
        </Empty>
      )}
      {view === "overview" && automationRecords.length ? (
        <section className="pj-panel">
          <h2>Planejamentos históricos de automação</h2>
          <p className="pj-muted">
            Configurações legadas preservadas. Não há execução ou envio automático nesta etapa.
          </p>
          {automationRecords.map((record) => (
            <details key={record.id} className="pj-history-item">
              <summary>
                {record.title} · {record.status === "paused" ? "Pausado" : record.status}
              </summary>
              <pre>{JSON.stringify(record.payload, null, 2)}</pre>
            </details>
          ))}
        </section>
      ) : null}
    </>
  );
}
