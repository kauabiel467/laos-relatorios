"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import type { MetaIntegrationStatus } from "@/lib/types";

interface MetaIntegrationModalProps {
  open: boolean;
  status: MetaIntegrationStatus | null;
  pending: boolean;
  feedback: string | null;
  onClose: () => void;
  onStart: () => void;
  onDisconnect: () => void;
  onConfirmSelection: (accountIds: string[]) => void;
}

export function MetaIntegrationModal({
  open,
  status,
  pending,
  feedback,
  onClose,
  onStart,
  onDisconnect,
  onConfirmSelection
}: MetaIntegrationModalProps) {
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !status) return;

    if (status.stage === "needs_selection") {
      setSelectedAccountIds(status.accounts.map((account) => account.id));
      return;
    }

    if (status.stage === "connected") {
      setSelectedAccountIds(status.accounts.map((account) => account.id));
      return;
    }

    setSelectedAccountIds([]);
  }, [open, status]);

  const canSubmitSelection = useMemo(() => selectedAccountIds.length > 0 && !pending, [pending, selectedAccountIds.length]);

  const isSelectionStage = status?.stage === "needs_selection";
  const isConnectedStage = status?.stage === "connected";

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 transition-opacity duration-200",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      onClick={onClose}
    >
      <div
        className={clsx(
          "panel max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto p-6 transition duration-200",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Passo a passo de integracao</div>
            <h2 className="text-2xl font-bold">Meta Ads</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Conecte o login da Meta, aceite as permissoes e escolha quais contas de anuncios deseja trazer para o dashboard.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-text">
            Fechar
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-bg p-5">
            <div className="mb-4 text-sm font-semibold text-text">Fluxo de autenticacao</div>
            <ol className="space-y-3 text-sm leading-6 text-muted">
              <li>1. Clique em integrar para abrir o login oficial do Facebook/Meta.</li>
              <li>2. Aceite as permissoes da conta que administra os anuncios.</li>
              <li>3. Ao voltar para o dashboard, selecione as contas que devem ficar disponiveis.</li>
              <li>4. Finalize a conexao e use as contas no painel normalmente.</li>
            </ol>

            {feedback ? (
              <div className="mt-4 rounded-xl border border-blue/30 bg-blue/10 p-3 text-sm text-blue-100">
                {feedback}
              </div>
            ) : null}

            {status?.error ? (
              <div className="mt-4 rounded-xl border border-red/30 bg-red/10 p-3 text-sm text-red-100">
                {status.error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              {!isConnectedStage ? (
                <button
                  type="button"
                  onClick={onStart}
                  disabled={pending || status?.stage === "missing_config"}
                  className="rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSelectionStage ? "Refazer login Meta" : "Integrar com a Meta"}
                </button>
              ) : null}

              {isConnectedStage ? (
                <button
                  type="button"
                  onClick={onDisconnect}
                  disabled={pending}
                  className="rounded-lg border border-border px-4 py-3 text-sm font-semibold text-text transition hover:border-blue"
                >
                  Desconectar
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex max-h-[65vh] flex-col rounded-2xl border border-border bg-bg p-5">
            <div className="mb-4 text-sm font-semibold text-text">
              {isSelectionStage ? "Selecione as contas" : "Status da conexao"}
            </div>

            {isSelectionStage ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {status.accounts.map((account) => {
                    const checked = selectedAccountIds.includes(account.id);

                    return (
                      <label key={account.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition hover:border-blue/40">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedAccountIds((current) =>
                              checked ? current.filter((item) => item !== account.id) : [...current, account.id]
                            );
                          }}
                          className="mt-1"
                        />
                        <div>
                          <div className="text-sm font-semibold text-text">{account.name}</div>
                          <div className="font-mono text-[11px] text-muted">act_{account.accountId}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setSelectedAccountIds(status.accounts.map((account) => account.id))}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text transition hover:border-blue"
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountIds([])}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text transition hover:border-blue"
                  >
                    Limpar
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onConfirmSelection(selectedAccountIds)}
                  disabled={!canSubmitSelection}
                  className="mt-4 w-full rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Conectar contas selecionadas
                </button>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {(status?.accounts || []).length ? (
                  status?.accounts.map((account) => (
                    <div key={account.id} className="rounded-xl border border-border p-3">
                      <div className="text-sm font-semibold text-text">{account.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted">act_{account.accountId}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted">
                    Nenhuma conta integrada ainda. Inicie o login da Meta para continuar.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
