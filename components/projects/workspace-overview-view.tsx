import type { AgencyData, AgencyRecord } from "@/lib/agency/types";
import type { ProjectDocument } from "@/lib/projects/model";
import { InterfaceIcon } from "./interface-icon";
import { shortDate } from "./ui";

export function WorkspaceOverviewView({
  data,
  docs,
  legacyDocs,
  onOpen,
}: {
  data: AgencyData;
  docs: ProjectDocument[];
  legacyDocs: AgencyRecord[];
  onOpen: (clientId: string, documentId: string) => void;
}) {
  const stats: [string, number][] = [
    ["Projetos", data.clients.length],
    ["Dashboards", docs.filter((d) => d.kind === "dashboard").length],
    [
      "Relatórios publicados",
      docs.filter((d) => d.kind === "report" && d.status === "published").length +
        legacyDocs.filter((record) => record.status === "published").length,
    ],
    ["Contas Meta vinculadas", data.clients.filter((c) => c.meta_account_id).length],
  ];
  return (
    <>
      <div className="pj-overview-grid">
        {stats.map(([label, value]) => (
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
              onClick={() => onOpen(d.client_id, d.id)}
            >
              <strong>{d.title}</strong>
              <span>{data.clients.find((c) => c.id === d.client_id)?.name}</span>
              <small>{shortDate(d.updated_at)}</small>
              <InterfaceIcon name="forward" size={18} />
            </button>
          ))}
        <p className="pj-muted">
          Visão das entregas da agência. Indicadores de plataformas diferentes
          permanecem separados por projeto.
        </p>
      </section>
    </>
  );
}
