"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { TeamContext, TeamRole } from "@/lib/team/types";
import { teamRoleLabels } from "@/lib/team/types";

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
  const [feedback, setFeedback] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
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
      void loadContext().catch((error) => setFeedback(error.message)).finally(() => setContextLoading(false));
    }
  }, [open, loadContext]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input,select,textarea") ?? []);
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
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
      body: JSON.stringify({ email: inviteEmail, role: inviteRole, team_id: teamId })
    });
    const payload = (await response.json()) as { error?: string; message?: string };

    setLoading(false);
    if (!response.ok) {
      setFeedback(payload.error || "Nao foi possivel enviar o convite.");
      return;
    }

    setInviteEmail("");
    setInviteRole("operator");
    setFeedback(payload.message || "Convite enviado.");
    await loadContext();
  }

  async function removeMember(memberId: string) {
    setLoading(true);
    setFeedback(null);

    const response = await fetch("/api/team/members/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, team_id: teamId })
    });
    const payload = (await response.json()) as { error?: string };

    setLoading(false);
    if (!response.ok) {
      setFeedback(payload.error || "Nao foi possivel remover o membro.");
      return;
    }

    setFeedback("Membro removido.");
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
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-settings-title"
        className={clsx(
          "panel max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto p-6 transition duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Equipe</div>
            <h2 id="team-settings-title" className="text-2xl font-bold text-text">{context?.team?.name || "Equipe"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Organize os membros e as permissões do workspace selecionado.
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

        {contextLoading ? (
          <p role="status">Carregando equipe…</p>
        ) : !context?.team && teamId ? (
          <p role="alert">Esta equipe não existe ou sua conta não possui acesso a ela.</p>
        ) : !context?.team ? (
          <section className="rounded-xl border border-border bg-bg p-4">
            <div className="mb-2 text-sm font-semibold text-text">Primeira equipe</div>
            <p className="mb-4 text-sm leading-6 text-muted">
              Crie uma equipe para convidar pessoas e controlar quem gerencia o dashboard.
            </p>
            <div className="flex flex-col items-end gap-3 sm:flex-row">
              <label className="min-w-0 flex-1 text-sm text-muted">
                Nome da equipe
                <input
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="Ex.: Agência LAOS"
                  className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
                />
              </label>
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
                {context.members.map((member) => {
                  const canRemove =
                    context.currentRole === "owner"
                      ? true
                      : context.currentRole === "manager"
                        ? member.role === "operator"
                        : false;

                  return (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3">
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
                          onClick={() => removeMember(member.id)}
                          className="rounded-md border border-red/30 px-2 py-1 font-mono text-[10px] text-red transition hover:bg-red hover:text-white"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-bg p-4">
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
                      onChange={(event) => setInviteEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      placeholder="email@empresa.com"
                      className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
                    />
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

        {feedback ? <div role="status" className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm text-muted">{feedback}</div> : null}
      </div>
    </div>
  );
}
