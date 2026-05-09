"use client";

import clsx from "clsx";
import type { MetaIntegrationStatus } from "@/lib/types";

interface ConfigModalProps {
  open: boolean;
  metaStatus: MetaIntegrationStatus | null;
  metaPending: boolean;
  onClose: () => void;
  onOpenMeta: () => void;
  onOpenCardapio: () => void;
}

const statusTone: Record<string, string> = {
  connected: "border-green/30 bg-green/10 text-green-200",
  needs_selection: "border-orange/30 bg-orange/10 text-orange-200",
  missing_config: "border-red/30 bg-red/10 text-red-200",
  disconnected: "border-border bg-bg text-muted"
};

function getMetaBadge(status: MetaIntegrationStatus | null) {
  if (!status) {
    return {
      label: "Carregando",
      tone: "disconnected"
    };
  }

  switch (status.stage) {
    case "connected":
      return {
        label: "Conectado",
        tone: "connected"
      };
    case "needs_selection":
      return {
        label: "Escolher contas",
        tone: "needs_selection"
      };
    case "missing_config":
      return {
        label: "Falta configurar",
        tone: "missing_config"
      };
    default:
      return {
        label: "Nao conectado",
        tone: "disconnected"
      };
  }
}

function getMetaDescription(status: MetaIntegrationStatus | null) {
  if (!status) {
    return "Carregando status da integracao da Meta.";
  }

  switch (status.stage) {
    case "connected":
      return `${status.accounts.length} conta(s) pronta(s) para uso no dashboard.`;
    case "needs_selection":
      return "O login da Meta ja foi concluido. Falta apenas escolher as contas que entram no painel.";
    case "missing_config":
      return "Complete META_APP_ID, META_APP_SECRET e redirect URI no servidor para liberar o login.";
    default:
      return "Abra o login oficial da Meta e autorize as contas que deseja analisar.";
  }
}

const placeholderIntegrations = [
  {
    name: "OpenAI / IA",
    description: "Resumo automatico, alertas e assistente de analise em cima dos dados conectados."
  },
  {
    name: "Cardapios digitais",
    description: "Conectar pedidos e faturamento reais para cruzar com o investimento de Meta Ads."
  },
  {
    name: "Google Ads e Analytics",
    description: "Bloco futuro para ampliar a leitura do cliente sem misturar com o MVP da Meta."
  }
];

export function ConfigModal({ open, metaStatus, metaPending, onClose, onOpenMeta, onOpenCardapio }: ConfigModalProps) {
  if (!open) return null;

  const badge = getMetaBadge(metaStatus);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="panel w-full max-w-5xl p-6 lg:p-7" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Central de integracoes</div>
            <h2 className="text-2xl font-bold text-text">Conexoes do dashboard</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Configure as integracoes que alimentam o dashboard. O foco agora e deixar a Meta redonda, com login oficial,
              permissao e escolha das contas.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:border-blue hover:text-text">
            Fechar
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="panel-soft p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow mb-2">Integracao principal</div>
                <h3 className="text-lg font-semibold text-text">Meta Ads</h3>
              </div>
              <span className={clsx("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", statusTone[badge.tone])}>
                {badge.label}
              </span>
            </div>

            <div className="rounded-2xl border border-border bg-bg p-4">
              <p className="text-sm leading-6 text-muted">{getMetaDescription(metaStatus)}</p>

              {metaStatus?.stage === "connected" && metaStatus.accounts.length ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {metaStatus.accounts.map((account) => (
                    <div key={account.id} className="rounded-xl border border-border px-3 py-3">
                      <div className="text-sm font-semibold text-text">{account.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted">act_{account.accountId}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {metaStatus?.error ? (
                <div className="mt-4 rounded-xl border border-red/30 bg-red/10 p-3 text-sm text-red-100">{metaStatus.error}</div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onOpenMeta}
                disabled={metaPending}
                className="rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:cursor-wait disabled:opacity-70"
              >
                {metaStatus?.stage === "connected" ? "Gerenciar integracao Meta" : "Conectar Meta Ads"}
              </button>
              <button
                type="button"
                onClick={onOpenCardapio}
                className="rounded-lg border border-border px-4 py-3 text-sm font-semibold text-text transition hover:border-blue"
              >
                Ver integracoes futuras
              </button>
            </div>
          </section>

          <section className="panel-soft p-5">
            <div className="eyebrow mb-2">Proximas camadas</div>
            <h3 className="text-lg font-semibold text-text">Roadmap de conexoes</h3>
            <div className="mt-4 space-y-3">
              {placeholderIntegrations.map((item) => (
                <div key={item.name} className="rounded-2xl border border-border bg-bg p-4">
                  <div className="mb-1 text-sm font-semibold text-text">{item.name}</div>
                  <p className="text-sm leading-6 text-muted">{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
