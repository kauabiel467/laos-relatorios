"use client";

import type { MetaIntegrationStatus } from "@/lib/types";

interface MetaIntegrationCardProps {
  status: MetaIntegrationStatus | null;
  loading: boolean;
  onOpen: () => void;
}

function getMetaLabel(status: MetaIntegrationStatus | null) {
  if (!status) {
    return "Carregando status...";
  }

  switch (status.stage) {
    case "connected":
      return `${status.accounts.length} conta(s) conectada(s)`;
    case "needs_selection":
      return "Selecione quais contas deseja integrar";
    case "missing_config":
      return "Configure o app da Meta no servidor";
    default:
      return "Nenhuma conta conectada";
  }
}

export function MetaIntegrationCard({ status, loading, onOpen }: MetaIntegrationCardProps) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Integracao principal</div>
          <h3 className="text-xl font-bold">Meta Ads</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Conecte o Facebook/Meta uma vez para autorizar o dashboard a listar e importar as contas de anuncios disponiveis.
          </p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-bg text-2xl text-blue">◎</div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="rounded-xl border border-border bg-bg p-4">
          <div className="text-sm font-semibold text-text">{getMetaLabel(status)}</div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {status?.stage === "connected"
              ? "O login foi concluido e as contas selecionadas ja podem ser usadas no dashboard."
              : "O fluxo abre o login da Meta, solicita permissao e permite escolher quais contas integrar."}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpen}
          disabled={loading}
          className="rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:cursor-wait disabled:opacity-70"
        >
          {status?.stage === "connected" ? "Gerenciar Meta" : "Integrar Meta"}
        </button>
      </div>
    </section>
  );
}
