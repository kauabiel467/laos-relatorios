"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import type { TeamContext, TeamRole } from "@/lib/team/types";
import { teamRoleLabels } from "@/lib/team/types";

interface TeamSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const roleOptions: TeamRole[] = ["owner", "manager", "operator"];

export function TeamSettingsModal({ open, onClose }: TeamSettingsModalProps) {
  const [context, setContext] = useState<TeamContext | null>(null);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("operator");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function loadContext() {
    const response = await fetch("/api/team/context", { cache: "no-store" });
    setContext((await response.json()) as TeamContext);
  }

  useEffect(() => {
    if (open) {
      void loadContext();
    }
  }, [open]);

  async function createTeam() {
    setLoading(true);
    setFeedback(null);

    const response = await fetch("/api/team/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName })
    });
    const payload = (await response.json()) as { error?: string };

    setLoading(false);
    if (!response.ok) {
      setFeedback(payload.error || "Nao foi possivel criar a equipe.");
      return;
    }

    setTeamName("");
    setFeedback("Equipe criada.");
    await loadContext();
  }

  async function inviteMember() {
    setLoading(true);
    setFeedback(null);

    const response = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole })
    });
    const payload = (await response.json()) as { error?: string };

    setLoading(false);
    if (!response.ok) {
      setFeedback(payload.error || "Nao foi possivel enviar o convite.");
      return;
    }

    setInviteEmail("");
    setInviteRole("operator");
    setFeedback("Convite enviado.");
    await loadContext();
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  }

  const canManage = context?.currentRole === "owner" || context?.currentRole === "manager";

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[85] grid place-items-center bg-black/70 p-4 transition-opacity duration-200",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      onClick={onClose}
    >
      <div
        className={clsx(
          "panel max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto p-6 transition duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Equipe</div>
            <h2 className="text-2xl font-bold text-text">{context?.team?.name || "Criar equipe"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Organize o acesso do dashboard por membros e permissoes.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={signOut} className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:border-red hover:text-red">
              Sair
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:border-blue hover:text-text">
              Fechar
            </button>
          </div>
        </div>

        {!context?.team ? (
          <section className="rounded-xl border border-border bg-bg p-4">
            <div className="mb-2 text-sm font-semibold text-text">Primeira equipe</div>
            <p className="mb-4 text-sm leading-6 text-muted">
              Crie uma equipe para convidar pessoas e controlar quem gerencia o dashboard.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="Nome da equipe"
                className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
              />
              <button
                type="button"
                onClick={createTeam}
                disabled={loading || !teamName.trim()}
                className="rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
              >
                Criar equipe
              </button>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <section className="rounded-xl border border-border bg-bg p-4">
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
                {context.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text">{member.email || member.user_id}</div>
                      <div className="font-mono text-[11px] text-muted">{member.user_id}</div>
                    </div>
                    <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted">
                      {teamRoleLabels[member.role]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-bg p-4">
              <div className="mb-4">
                <div className="text-sm font-semibold text-text">Convidar membro</div>
                <div className="font-mono text-[11px] text-muted">Dono, gerente ou gestor</div>
              </div>
              {canManage ? (
                <div className="space-y-3">
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    type="email"
                    placeholder="email@empresa.com"
                    className="w-full rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {roleOptions.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setInviteRole(role)}
                        className={clsx(
                          "rounded-lg border px-3 py-2 text-xs font-semibold transition",
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
                    className="w-full rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
                  >
                    Enviar convite
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted">
                  Apenas dono e gerente podem convidar membros.
                </div>
              )}

              {context.invitations.length ? (
                <div className="mt-5 space-y-2">
                  <div className="eyebrow">Convites pendentes</div>
                  {context.invitations.map((invite) => (
                    <div key={invite.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <div className="font-semibold text-text">{invite.email}</div>
                      <div className="font-mono text-[11px] text-muted">{teamRoleLabels[invite.role]}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        )}

        {feedback ? <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm text-muted">{feedback}</div> : null}
      </div>
    </div>
  );
}
