import type { MetaIntegrationStatus } from "@/lib/types";
import { workspaceHref } from "@/lib/projects/routes";
import { Dialog, MetaMark } from "./ui";
import { InterfaceIcon } from "./interface-icon";

export function WorkspaceMetaModal({
  projectName,
  projectId,
  onboardingValue,
  busy,
  metaLoading,
  metaError,
  meta,
  accountSearch,
  account,
  notice,
  onClose,
  onRetry,
  onSearchAccount,
  onSelectAccount,
  onBind,
}: {
  projectName?: string;
  projectId: string;
  onboardingValue: string | null;
  busy: boolean;
  metaLoading: boolean;
  metaError: string;
  meta: MetaIntegrationStatus | null;
  accountSearch: string;
  account: string;
  notice: string;
  onClose: () => void;
  onRetry: () => void;
  onSearchAccount: (value: string) => void;
  onSelectAccount: (accountId: string) => void;
  onBind: () => void;
}) {
  const startMetaAuth = () => {
    window.location.href =
      "/api/integrations/meta/start?returnTo=" +
      encodeURIComponent(
        workspaceHref("integrations", {
          projectId,
          onboarding: onboardingValue ?? undefined,
        }),
      );
  };
  return (
    <Dialog title="Conectar Meta Ads" close={onClose} busy={busy} wide>
      <p>
        Selecione a conta de anúncios que pertence a <strong>{projectName}</strong>.
      </p>
      {metaLoading ? (
        <div className="pj-empty pj-empty-compact" role="status">
          <MetaMark />
          <h3>Consultando sua autorização Meta…</h3>
          <p>Estamos carregando as contas disponíveis.</p>
        </div>
      ) : metaError ? (
        <div className="pj-warning" role="alert">
          <strong>Não foi possível carregar as contas.</strong>
          <p>{metaError}</p>
          <button type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : meta?.stage === "connected" || meta?.stage === "needs_selection" ? (
        <>
          <label className="pj-search-label">
            Buscar conta de anúncios
            <input
              className="pj-search"
              type="search"
              placeholder="Nome ou ID da conta"
              value={accountSearch}
              onChange={(e) => onSearchAccount(e.target.value)}
            />
          </label>
          <div className="pj-account-grid" role="radiogroup" aria-label="Contas de anúncios disponíveis">
            {meta.accounts
              .filter((a) => (a.name + " " + a.id).toLowerCase().includes(accountSearch.toLowerCase()))
              .map((a) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={account === a.id}
                  className={"pj-source " + (account === a.id ? "selected" : "")}
                  key={a.id}
                  onClick={() => onSelectAccount(a.id)}
                >
                  <MetaMark />
                  <div>
                    <strong>{a.name}</strong>
                    <small>{a.id}</small>
                    <small>
                      {[a.currency, a.timezoneName, "Status " + a.status].filter(Boolean).join(" · ")}
                    </small>
                  </div>
                  {account === a.id && (
                    <span>
                      <InterfaceIcon name="check" size={18} />
                    </span>
                  )}
                </button>
              ))}
          </div>
          {!meta.accounts.some((a) => (a.name + " " + a.id).toLowerCase().includes(accountSearch.toLowerCase())) ? (
            <div className="pj-empty pj-empty-compact">
              <h3>Nenhuma conta encontrada</h3>
              <p>Confira a pesquisa ou autorize outro usuário Meta que tenha acesso à conta.</p>
            </div>
          ) : null}
          <div className="pj-actions">
            <button type="button" onClick={startMetaAuth}>
              Autorizar outras contas
            </button>
            <button type="button" className="accent" disabled={busy || !account} onClick={onBind}>
              {busy ? "Vinculando…" : "Vincular ao projeto"}
            </button>
          </div>
        </>
      ) : (
        <div className="pj-empty">
          <MetaMark />
          <h3>Autorize o acesso pelo Facebook</h3>
          <p>{meta?.error ?? "Depois da autorização, você volta para escolher a conta deste projeto."}</p>
          <button type="button" className="primary" disabled={meta?.stage === "missing_config"} onClick={startMetaAuth}>
            Continuar com o Facebook
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="pj-warning">
          {notice}
        </p>
      )}
    </Dialog>
  );
}
