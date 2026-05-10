"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { TeamRole } from "@/lib/team/types";
import { teamRoleLabels } from "@/lib/team/types";

const roleOptions: TeamRole[] = ["owner", "manager", "operator"];

export function NewWorkspaceFlow() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [teamCreated, setTeamCreated] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("operator");
  const [invites, setInvites] = useState<Array<{ email: string; role: TeamRole }>>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function createWorkspace() {
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

    setTeamCreated(true);
    setFeedback("Workspace criado. Agora voce pode convidar a equipe.");
  }

  async function sendInvite() {
    setLoading(true);
    setFeedback(null);

    const response = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole })
    });
    const payload = (await response.json()) as { error?: string; message?: string };

    setLoading(false);
    if (!response.ok) {
      setFeedback(payload.error || "Nao foi possivel enviar o convite.");
      return;
    }

    setInvites((current) => [{ email: inviteEmail, role: inviteRole }, ...current]);
    setInviteEmail("");
    setInviteRole("operator");
    setFeedback(payload.message || "Convite enviado.");
  }

  return (
    <div className="panel w-full max-w-3xl p-6 lg:p-8">
      <div className="mb-8">
        <div className="eyebrow mb-2">New Workspace</div>
        <h1 className="text-3xl font-bold text-text">Crie sua equipe</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Configure o workspace inicial e convide as pessoas certas logo no primeiro acesso.
        </p>
      </div>

      {!teamCreated ? (
        <section className="rounded-xl border border-border bg-bg p-5">
          <div className="mb-2 text-lg font-semibold text-text">Criar do zero</div>
          <p className="mb-4 text-sm leading-6 text-muted">
            Escolha um nome para o workspace da sua equipe e siga para os convites.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Ex.: Laos Growth Team"
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-3 text-sm outline-none transition focus:border-blue"
            />
            <button
              type="button"
              onClick={createWorkspace}
              disabled={loading || !teamName.trim()}
              className="rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
            >
              {loading ? "Criando..." : "Criar workspace"}
            </button>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-xl border border-border bg-bg p-5">
            <div className="mb-4 text-lg font-semibold text-text">Convide por e-mail</div>
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
                onClick={sendInvite}
                disabled={loading || !inviteEmail.trim()}
                className="w-full rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
              >
                {loading ? "Enviando..." : "Enviar convite"}
              </button>
              <button
                type="button"
                onClick={() => router.replace("/")}
                className="w-full rounded-lg border border-border px-4 py-3 text-sm font-semibold text-text transition hover:border-blue"
              >
                Entrar no dashboard
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-bg p-5">
            <div className="mb-4 text-lg font-semibold text-text">Convites enviados</div>
            <div className="space-y-2">
              {invites.length ? (
                invites.map((invite) => (
                  <div key={`${invite.email}-${invite.role}`} className="rounded-lg border border-border bg-card px-3 py-3">
                    <div className="text-sm font-semibold text-text">{invite.email}</div>
                    <div className="font-mono text-[11px] text-muted">{teamRoleLabels[invite.role]}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
                  Nenhum convite enviado ainda.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {feedback ? <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm text-muted">{feedback}</div> : null}
    </div>
  );
}
