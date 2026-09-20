"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import type { TeamContext, TeamRole } from "@/lib/team/types";
import { teamRoleLabels } from "@/lib/team/types";
import { Dialog, FieldMessage, Toast } from "@/components/projects/ui";

interface TeamSettingsModalProps {
  open: boolean;
  onClose: () => void;
  teamId?: string;
}

const roleOptions: TeamRole[] = ["owner", "manager", "operator"];

export function TeamSettingsModal({ open, onClose, teamId }: TeamSettingsModalProps) {
  const [context, setContext] = useState<TeamContext | null>(null);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("operator");
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [teamNameError, setTeamNameError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [removeMemberId, setRemoveMemberId] = useState("");

  const loadContext = useCallback(async () => {
    const response = await fetch(`/api/team/context${teamId ? `?team_id=${encodeURIComponent(teamId)}` : ""}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error ?? "Não foi possível carregar a equipe.");
    setContext(payload as TeamContext);
  }, [teamId]);

  useEffect(() => {
    if (open) {
      setContext(null);
      setContextLoading(true);
      setFeedback(null);
      void loadContext()
        .catch((error) => setFeedback({
          message: `${error.message} Tente novamente ou feche esta janela e reabra as configurações.`,
          tone: "error",
        }))
        .finally(() => setContextLoading(false));
    }
  }, [open, loadContext]);

  async function createTeam() {
    if (loading) return;
    if (teamName.trim().length < 2) {
      setTeamNameError("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    setLoading(true);
    setFeedback(null);
    setTeamNameError("");
    try {
      const response = await fetch("/api/team/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(payload.error || "Não foi possível criar a equipe.");
      setTeamName("");
      setFeedback({ message: "Equipe criada com sucesso.", tone: "success" });
      await loadContext();
    } catch (error) {
      setFeedback({
        message: `${error instanceof Error ? error.message : "Não foi possível criar a equipe."} Revise o nome e tente novamente.`,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function inviteMember() {
    if (loading) return;
    if (!/^\S+@\S+\.\S+$/.test(inviteEmail.trim())) {
      setInviteError("Informe um e-mail válido, como nome@empresa.com.");
      return;
    }
    setLoading(true);
    setFeedback(null);
    setInviteError("");
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, team_id: teamId })
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw Error(payload.error || "Não foi possível enviar o convite.");
      setInviteEmail("");
      setInviteRole("operator");
      setFeedback({ message: payload.message || "Convite enviado com sucesso.", tone: "success" });
      await loadContext();
    } catch (error) {
      setFeedback({
        message: `${error instanceof Error ? error.message : "Não foi possível enviar o convite."} Confirme o e-mail e tente novamente.`,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function removeMember(memberId: string) {
    if (loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/team/members/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, team_id: teamId })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(payload.error || "Não foi possível remover o membro.");
      setRemoveMemberId("");
      setFeedback({ message: "Membro removido da equipe.", tone: "success" });
      await loadContext();
    } catch (error) {
      setFeedback({
        message: `${error instanceof Error ? error.message : "Não foi possível remover o membro."} Atualize a equipe e tente novamente.`,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  const canManage = context?.currentRole === "owner" || context?.currentRole === "manager";

  if (!open) return null;
  return (
    <>
      <Dialog
        title={context?.team?.name || "Equipe e acessos"}
        close={onClose}
        busy={loading}
        wide
      >
        <div className="pj-team-modal-body">
        <p className="pj-dialog-intro">
          Organize os membros e as permissões do workspace selecionado.
        </p>
        {contextLoading ? (
          <p className="pj-team-loading" role="status">Carregando equipe…</p>
        ) : !context?.team && teamId ? (
          <p role="alert">Esta equipe não existe ou sua conta não possui acesso a ela.</p>
        ) : !context?.team ? (
          <section className="pj-team-section rounded-xl border border-border bg-bg p-4">
            <div className="mb-2 text-sm font-semibold text-text">Primeira equipe</div>
            <p className="mb-4 text-sm leading-6 text-muted">
              Crie uma equipe para convidar pessoas e controlar quem gerencia o dashboard.
            </p>
            <div className="flex flex-col items-end gap-3 sm:flex-row">
              <label className="min-w-0 flex-1 text-sm text-muted">
                Nome da equipe
                <input
                  data-autofocus
                  value={teamName}
                  onChange={(event) => {
                    setTeamName(event.target.value);
                    if (teamNameError) setTeamNameError("");
                  }}
                  aria-invalid={Boolean(teamNameError)}
                  aria-describedby="team-name-help"
                  placeholder="Ex.: Agência LAOS"
                  className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
                />
                <FieldMessage id="team-name-help" error={Boolean(teamNameError)}>
                  {teamNameError || "Use o nome pelo qual sua equipe identifica este workspace."}
                </FieldMessage>
              </label>
              <button
                type="button"
                onClick={createTeam}
                disabled={loading || !teamName.trim()}
                className="accent rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
              >
                {loading ? "Criando equipe…" : "Criar equipe"}
              </button>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <section className="pj-team-section rounded-xl border border-border bg-bg p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text">Membros</div>
                  <div className="font-mono text-[11px] text-muted">{context.members.length} pessoa(s)</div>
                </div>
                {context.currentRole ? (
                  <span className="rounded-md border border-blue/30 bg-blue/10 px-2 py-1 font-mono text-[10px] text-blue-100">
                    {teamRoleLabels[context.currentRole]}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2">
                {context.members.map((member) => {
                  const canRemove =
                    context.currentRole === "owner"
                      ? true
                      : context.currentRole === "manager"
                        ? member.role === "operator"
                        : false;

                  return (
                  <div key={member.id} className="pj-team-member rounded-lg border border-border bg-card px-3 py-3">
                    <div className="pj-team-member-row flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text">{member.email || member.user_id}</div>
                      <div className="font-mono text-[11px] text-muted">{member.user_id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted">
                        {teamRoleLabels[member.role]}
                      </span>
                      {canRemove ? (
                        <button
                          type="button"
                          onClick={() => setRemoveMemberId(member.id)}
                          disabled={loading}
                          className="danger rounded-md border border-red/30 px-2 py-1 font-mono text-[10px] text-red transition hover:bg-red hover:text-white"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                    </div>
                    {removeMemberId === member.id ? (
                      <div className="pj-inline-confirm" role="alert">
                        <p>
                          Remover {member.email || "este membro"}? A pessoa perderá o acesso da equipe.
                        </p>
                        <div>
                          <button type="button" disabled={loading} onClick={() => setRemoveMemberId("")}>
                            Manter membro
                          </button>
                          <button type="button" className="danger" disabled={loading} onClick={() => void removeMember(member.id)}>
                            {loading ? "Removendo…" : "Remover membro"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
                })}
              </div>
            </section>

            <section className="pj-team-section rounded-xl border border-border bg-bg p-4">
              <div className="mb-4">
                <div className="text-sm font-semibold text-text">Convidar membro</div>
                <div className="font-mono text-[11px] text-muted">Dono, gerente ou gestor</div>
              </div>
              {canManage ? (
                <div className="space-y-3">
                  <label className="block text-sm text-muted">
                    E-mail do membro
                    <input
                      value={inviteEmail}
                      onChange={(event) => {
                        setInviteEmail(event.target.value);
                        if (inviteError) setInviteError("");
                      }}
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      aria-invalid={Boolean(inviteError)}
                      aria-describedby="invite-email-help"
                      placeholder="email@empresa.com"
                      className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
                    />
                    <FieldMessage id="invite-email-help" error={Boolean(inviteError)}>
                      {inviteError || "A pessoa receberá um convite para entrar no workspace."}
                    </FieldMessage>
                  </label>
                  <div
                    className="grid grid-cols-3 gap-2"
                    role="group"
                    aria-label="Papel do novo membro"
                  >
                    {roleOptions.map((role) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={inviteRole === role}
                        onClick={() => setInviteRole(role)}
                        className={clsx(
                          "pj-team-role rounded-lg border px-3 py-2 text-xs font-semibold transition",
                          inviteRole === role ? "border-blue bg-blue/10 text-blue-100" : "border-border text-muted hover:border-blue"
                        )}
                      >
                        {teamRoleLabels[role]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={inviteMember}
                    disabled={loading || !inviteEmail.trim()}
                    className="accent w-full rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
                  >
                    {loading ? "Enviando convite…" : "Enviar convite"}
                  </button>
                </div>
              ) : (
                <div className="pj-team-member rounded-xl border border-border bg-card p-3 text-sm text-muted">
                  Apenas dono e gerente podem convidar membros.
                </div>
              )}

              {context.invitations.length ? (
                <div className="mt-5 space-y-2">
                  <div className="eyebrow">Convites pendentes</div>
                  {context.invitations.map((invite) => (
                    <div key={invite.id} className="pj-team-member rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <div className="font-semibold text-text">{invite.email}</div>
                      <div className="font-mono text-[11px] text-muted">{teamRoleLabels[invite.role]}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        )}

        {feedback?.tone === "error" ? (
          <div role="alert" className="pj-team-feedback error mt-4 rounded-xl border border-border bg-bg p-3 text-sm text-muted">
            <strong>Não foi possível concluir</strong>
            <p>{feedback.message}</p>
            <button
              type="button"
              disabled={loading || contextLoading}
              onClick={() => {
                setContextLoading(true);
                setFeedback(null);
                void loadContext()
                  .catch((error) => setFeedback({
                    message: `${error instanceof Error ? error.message : "Não foi possível atualizar a equipe."} Tente novamente em instantes.`,
                    tone: "error",
                  }))
                  .finally(() => setContextLoading(false));
              }}
            >
              Atualizar equipe
            </button>
          </div>
        ) : null}
        </div>
      </Dialog>
      {feedback?.tone === "success" ? (
        <Toast message={feedback.message} close={() => setFeedback(null)} />
      ) : null}
    </>
  );
}
