import type { AgencyData } from "@/lib/agency/types";

export function WorkspaceTeamView({
  isStaff,
  teams,
  selectedTeamId,
  hasSelectedTeam,
  onSelectTeam,
  onManageTeam,
}: {
  isStaff: boolean;
  teams: AgencyData["teams"];
  selectedTeamId: string | undefined;
  hasSelectedTeam: boolean;
  onSelectTeam: (teamId: string) => void;
  onManageTeam: () => void;
}) {
  return (
    <section className="pj-panel pj-team-settings">
      <span className="pj-section-label">WORKSPACE DA AGÊNCIA</span>
      <h2>Equipe e configurações</h2>
      <p>
        Convide gestores e operadores e defina as permissões da equipe responsável pelos projetos.
      </p>
      {isStaff ? (
        <>
          <label>Workspace
            <select value={selectedTeamId ?? ""} onChange={(event) => onSelectTeam(event.target.value)}>
              {!hasSelectedTeam ? <option value={selectedTeamId ?? ""} disabled>Workspace indisponível</option> : null}
              {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button className="accent" disabled={!hasSelectedTeam} onClick={onManageTeam}>
            Gerenciar membros e convites
          </button>
        </>
      ) : (
        <p className="pj-muted">
          Seu acesso é de cliente. Apenas a equipe da agência pode gerenciar membros.
        </p>
      )}
    </section>
  );
}
