import type { ProjectDocument } from "@/lib/projects/model";
import { Empty } from "./ui";

export function WorkspaceTemplatesView({
  docs,
  search,
  onSearch,
  onOpen,
}: {
  docs: ProjectDocument[];
  search: string;
  onSearch: (value: string) => void;
  onOpen: (clientId: string, documentId: string) => void;
}) {
  const templates = docs.filter(
    (d) => d.kind === "template" && d.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="pj-list-toolbar">
        <input
          className="pj-search"
          placeholder="Buscar template…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Buscar template da equipe"
        />
      </div>
      <div className="pj-document-grid">
        {templates.map((d) => (
          <button
            className="pj-document-card"
            key={d.id}
            onClick={() => onOpen(d.client_id, d.id)}
          >
            <span className="pj-document-icon">▦</span>
            <div>
              <h3>{d.title}</h3>
              <p>
                {d.config.metrics.length} indicadores · {d.config.sections.length} blocos
              </p>
              <small>Modelo reutilizável da equipe</small>
            </div>
          </button>
        ))}
      </div>
      {!docs.some((d) => d.kind === "template") && (
        <Empty title="Sua biblioteca de templates">
          <p>
            Monte uma análise e escolha “Salvar como template”. O modelo
            ficará disponível ao criar documentos em outros projetos.
          </p>
        </Empty>
      )}
    </>
  );
}
