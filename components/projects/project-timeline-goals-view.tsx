import type { AgencyRecord } from "@/lib/agency/types";
import { Empty, shortDate } from "./ui";
import { InterfaceIcon } from "./interface-icon";

export function ProjectTimelineGoalsView({
  view,
  staff,
  records,
  onCreate,
  onUpdateGoal,
}: {
  view: "timeline" | "goals";
  staff: boolean;
  records: AgencyRecord[];
  onCreate: () => void;
  onUpdateGoal: (recordId: string) => void;
}) {
  return (
    <section className="pj-panel">
      <div className="pj-list-toolbar">
        <h2>{view === "timeline" ? "Linha do tempo" : "Metas do projeto"}</h2>
        {staff && (
          <button className="accent" onClick={onCreate}>
            <InterfaceIcon name="plus" size={18} />{" "}
            {view === "timeline" ? "Registrar ação" : "Criar meta"}
          </button>
        )}
      </div>
      {records.map((r) => (
        <article className="pj-history-item" key={r.id}>
          <small>
            {shortDate(r.created_at)} · {r.visibility === "shared" ? "Compartilhado" : "Interno"}
          </small>
          <h3>{r.title}</h3>
          <p>{r.payload.description}</p>
          {r.kind === "goal" && (
            <div>
              <p>
                {r.payload.metric}: {r.payload.actual ?? 0} / {r.payload.target} · Prazo:{" "}
                {r.payload.deadline ? shortDate(r.payload.deadline) : "—"}
              </p>
              {staff && <button onClick={() => onUpdateGoal(r.id)}>Atualizar realizado</button>}
            </div>
          )}
        </article>
      ))}
      {!records.length && (
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
  );
}
