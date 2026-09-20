"use client";

import { useState } from "react";
import type {
  ProjectClientAccess,
  ProjectClientInvitation,
} from "@/lib/agency/types";
import type { TeamMember } from "@/lib/team/types";
import { teamRoleLabels } from "@/lib/team/types";

export function ProjectAccessPanel({
  teamName,
  members,
  clientAccess,
  invitations,
  canManage,
  busy,
  onManageTeam,
  onInvite,
  onRevokeAccess,
  onRevokeInvitation,
}: {
  teamName: string;
  members: TeamMember[];
  clientAccess: ProjectClientAccess[];
  invitations: ProjectClientInvitation[];
  canManage: boolean;
  busy: boolean;
  onManageTeam: () => void;
  onInvite: (email: string) => Promise<boolean>;
  onRevokeAccess: (userId: string) => Promise<void>;
  onRevokeInvitation: (invitationId: string) => Promise<void>;
}) {
  const [confirmAction, setConfirmAction] = useState<{
    kind: "access" | "invitation";
    id: string;
    label: string;
  } | null>(null);

  const confirmRevoke = async () => {
    if (!confirmAction || busy) return;
    if (confirmAction.kind === "access") await onRevokeAccess(confirmAction.id);
    else await onRevokeInvitation(confirmAction.id);
    setConfirmAction(null);
  };

  return (
    <div className="pj-access-stack">
      <section className="pj-panel" aria-labelledby="internal-team-title">
        <div className="pj-section-heading">
          <div>
            <span className="pj-section-label">EQUIPE INTERNA</span>
            <h2 id="internal-team-title">{teamName}</h2>
            <p>
              Os papéis abaixo são reais e valem para os projetos desta equipe.
            </p>
          </div>
          <button type="button" onClick={onManageTeam}>
            Gerenciar equipe
          </button>
        </div>
        <div className="pj-access-list">
          {members.map((member) => (
            <div className="pj-access-row" key={member.id}>
              <span className="pj-small-avatar" aria-hidden="true">
                {(member.email ?? "M").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{member.email ?? "Membro sem e-mail público"}</strong>
                <small>{teamRoleLabels[member.role]}</small>
              </div>
              <span className="pj-role-badge">
                {teamRoleLabels[member.role]}
              </span>
            </div>
          ))}
          {!members.length ? (
            <div className="pj-empty pj-empty-compact">
              <h3>Nenhum membro interno encontrado</h3>
              <p>Adicione gestores e operadores para dividir a operação deste projeto.</p>
              <button type="button" onClick={onManageTeam}>Gerenciar equipe</button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="pj-panel" aria-labelledby="client-access-title">
        <div className="pj-section-heading">
          <div>
            <span className="pj-section-label">ACESSO DO CLIENTE</span>
            <h2 id="client-access-title">Clientes convidados</h2>
            <p>
              O papel disponível nesta etapa é Cliente — visualização. Ele não
              expõe credenciais, rascunhos ou configurações internas.
            </p>
          </div>
        </div>

        {canManage ? (
          <form
            className="pj-invite-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const email = String(new FormData(form).get("email") ?? "");
              void onInvite(email).then((saved) => {
                if (saved) form.reset();
              });
            }}
          >
            <label>
              E-mail do cliente
              <input
                type="email"
                name="email"
                required
                maxLength={320}
                autoComplete="email"
                placeholder="cliente@empresa.com"
              />
            </label>
            <label>
              Papel
              <select name="role" defaultValue="viewer" disabled aria-readonly="true">
                <option value="viewer">Cliente — visualização</option>
              </select>
            </label>
            <button className="accent" disabled={busy}>
              {busy ? "Salvando…" : "Convidar cliente"}
            </button>
          </form>
        ) : (
          <div className="pj-hint">
            Seu papel permite visualizar os acessos. Somente dono e gerente da
            equipe podem convidar ou revogar clientes.
          </div>
        )}

        <div className="pj-access-list" aria-live="polite">
          {clientAccess.map((access) => (
            <div className="pj-access-row" key={access.user_id}>
              <span className="pj-small-avatar" aria-hidden="true">
                {(access.email ?? "C").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{access.email ?? access.user_id}</strong>
                <small>Acesso ativo</small>
              </div>
              <span className="pj-status-badge connected">Cliente</span>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmAction({
                    kind: "access",
                    id: access.user_id,
                    label: access.email ?? "este cliente",
                  })}
                  aria-label={`Revogar acesso de ${access.email ?? "cliente"}`}
                >
                  Revogar
                </button>
              ) : null}
            </div>
          ))}
          {invitations.map((invitation) => (
            <div className="pj-access-row" key={invitation.id}>
              <span className="pj-small-avatar pending" aria-hidden="true">
                {invitation.email.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{invitation.email}</strong>
                <small>Aguardando cadastro ou confirmação do e-mail</small>
              </div>
              <span className="pj-status-badge beta">Pendente</span>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmAction({
                    kind: "invitation",
                    id: invitation.id,
                    label: invitation.email,
                  })}
                  aria-label={`Cancelar convite de ${invitation.email}`}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          ))}
          {!clientAccess.length && !invitations.length ? (
            <div className="pj-empty pj-empty-compact">
              <h3>O cliente ainda não tem acesso</h3>
              <p>Convide o contato acima para que ele visualize apenas os documentos publicados deste projeto.</p>
            </div>
          ) : null}
        </div>

        {confirmAction ? (
          <div className="pj-inline-confirm" role="alert">
            <p>
              {confirmAction.kind === "access"
                ? `Revogar o acesso de ${confirmAction.label}? A pessoa deixará de ver este projeto.`
                : `Cancelar o convite de ${confirmAction.label}? O link de entrada deixará de funcionar.`}
            </p>
            <div>
              <button type="button" disabled={busy} onClick={() => setConfirmAction(null)}>
                Manter acesso
              </button>
              <button type="button" className="danger" disabled={busy} onClick={() => void confirmRevoke()}>
                {busy ? "Revogando…" : confirmAction.kind === "access" ? "Revogar acesso" : "Cancelar convite"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
