"use client";

import { useState } from "react";
import type {
  AgencyClient,
  ProjectMetaConnection,
} from "@/lib/agency/types";
import {
  INTEGRATION_STATUS_LABELS,
  PROJECT_INTEGRATIONS,
  type IntegrationAvailability,
} from "@/lib/projects/config";
import { BrandIcon } from "./brand-icons";
import { Dialog, FieldMessage, MetaMark, Toast, shortDate } from "./ui";
import { InterfaceIcon } from "./interface-icon";

type IfoodLinkCode = {
  userCode: string;
  verificationUrl: string;
  verificationUrlComplete: string | null;
  expiresIn: number;
  expiresAt: string;
};

function connectionMessage(connection: ProjectMetaConnection | null) {
  if (!connection) return "Nenhuma conta vinculada.";
  switch (connection.connection_status) {
    case "connected":
      return "Conexão testada e pronta para coletar dados.";
    case "untested":
      return "O vínculo existe, mas ainda precisa de um teste ao vivo.";
    case "reauth_required":
      return "A autorização expirou ou foi revogada. Reconecte a Meta.";
    case "temporarily_unavailable":
      return "A Meta estava temporariamente indisponível no último teste.";
    default:
      return connection.last_error_message ?? "A conexão precisa de atenção.";
  }
}

function healthLabel(connection: ProjectMetaConnection) {
  switch (connection.connection_status) {
    case "connected":
      return "Conectado";
    case "untested":
      return "Teste necessário";
    case "reauth_required":
      return "Reconectar";
    case "temporarily_unavailable":
      return "Falha temporária";
    default:
      return "Com erro";
  }
}

export function ProjectIntegrations({
  project,
  connection,
  canConfigure,
  canUnlink,
  busy,
  search,
  onSearch,
  onConnect,
  onTest,
  onUnlink,
}: {
  project: AgencyClient;
  connection: ProjectMetaConnection | null;
  canConfigure: boolean;
  canUnlink: boolean;
  busy: boolean;
  search: string;
  onSearch: (value: string) => void;
  onConnect: () => void;
  onTest: () => void;
  onUnlink: () => void;
}) {
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [ifoodOpen, setIfoodOpen] = useState(false);
  const [ifoodLoading, setIfoodLoading] = useState(false);
  const [ifoodError, setIfoodError] = useState("");
  const [ifoodCode, setIfoodCode] = useState<IfoodLinkCode | null>(null);
  const [ifoodCopied, setIfoodCopied] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const visible = PROJECT_INTEGRATIONS.filter((integration) =>
    `${integration.name} ${integration.description}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedSearch),
  );
  const isConnected = connection?.connection_status === "connected";
  const generateIfoodCode = async () => {
    if (ifoodLoading) return;
    setIfoodLoading(true);
    setIfoodError("");
    try {
      const response = await fetch("/api/integrations/ifood/user-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const payload = await response.json() as IfoodLinkCode & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível gerar o código de vinculação.");
      }
      setIfoodCode(payload);
    } catch (error) {
      setIfoodError(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o código de vinculação.",
      );
    } finally {
      setIfoodLoading(false);
    }
  };

  return (
    <div className="pj-integrations-content">
      {connection ? (
        <section className="pj-panel" aria-labelledby="linked-account-title">
          <div className="pj-section-heading">
            <div>
              <span className="pj-section-label">CONTA VINCULADA</span>
              <h2 id="linked-account-title">Meta Ads</h2>
            </div>
            <span
              className={`pj-status-badge ${
                isConnected ? "connected" : "unavailable"
              }`}
            >
              {healthLabel(connection)}
            </span>
          </div>
          <div className="pj-connected pj-connected-detailed">
            <MetaMark />
            <div>
              <strong>{connection.account_name ?? "Conta Meta"}</strong>
              <p>{connection.account_id}</p>
              <p>{connectionMessage(connection)}</p>
              <div className="pj-account-metadata">
                <span>Moeda: {connection.account_currency ?? "não informada"}</span>
                <span>Fuso: {connection.account_timezone ?? "não informado"}</span>
                <span>Status Meta: {connection.account_status ?? "não informado"}</span>
              </div>
            </div>
            <small>
              {connection.last_checked_at
                ? `Último teste em ${shortDate(connection.last_checked_at)}`
                : "Ainda não testada"}
            </small>
            {canConfigure ? (
              <div className="pj-inline-actions">
                <button type="button" disabled={busy} onClick={onTest}>
                  {busy ? "Testando…" : "Testar novamente"}
                </button>
                <button type="button" disabled={busy} onClick={onConnect}>
                  Trocar conta
                </button>
                {canUnlink ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="danger"
                    onClick={() => setConfirmUnlink(true)}
                  >
                    Desvincular
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {confirmUnlink ? (
            <div className="pj-inline-confirm" role="alert">
              <p>
                Desvincular a Meta deste projeto? A coleta será interrompida, mas dashboards e relatórios salvos serão preservados.
              </p>
              <div>
                <button type="button" disabled={busy} onClick={() => setConfirmUnlink(false)}>
                  Manter conexão
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    onUnlink();
                    setConfirmUnlink(false);
                  }}
                >
                  {busy ? "Desvinculando…" : "Desvincular Meta"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : project.meta_account_id ? (
        <div className="pj-warning" role="alert">
          Existe uma identificação Meta antiga neste projeto, mas o vínculo
          protegido não foi encontrado. Reconecte a conta antes de coletar dados.
        </div>
      ) : null}

      <section aria-labelledby="integration-catalog-title">
        <div className="pj-section-heading">
          <div>
            <span className="pj-section-label">FONTES DE DADOS</span>
            <h2 id="integration-catalog-title">Catálogo de integrações</h2>
            <p>
              Somente integrações com conexão e coleta implementadas podem ser
              acionadas.
            </p>
          </div>
        </div>
        <label className="pj-search-label">
          Pesquisar integração
          <input
            className="pj-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.currentTarget.value)}
            placeholder="Ex.: Meta Ads ou iFood"
          />
        </label>
        <div className="pj-integration-grid">
          {visible.map((integration) => {
            const metaConnected = integration.id === "meta" && isConnected;
            const primaryStatus: IntegrationAvailability = metaConnected
              ? "connected"
              : integration.availability;
            return (
              <article
                className={`pj-integration-card ${metaConnected ? "connected" : ""} ${integration.id === "ifood" ? "is-ifood" : ""}`}
                key={integration.id}
              >
                <div className="pj-integration-card-header">
                  <span
                    className={`pj-integration-brand ${integration.id === "ifood" ? "is-ifood" : ""}`}
                    style={{ background: integration.color }}
                    aria-hidden="true"
                  >
                    <BrandIcon name={integration.icon} />
                  </span>
                  <div className="pj-badge-row">
                    <span className={`pj-status-badge ${primaryStatus}`}>
                      {INTEGRATION_STATUS_LABELS[primaryStatus]}
                    </span>
                    {"maturity" in integration ? (
                      <span className="pj-status-badge beta">
                        {INTEGRATION_STATUS_LABELS.beta}
                      </span>
                    ) : null}
                  </div>
                </div>
                <h3>{integration.name}</h3>
                <p>{integration.description}</p>
                <small>{integration.note}</small>
                {integration.id === "ifood" ? (
                  <button
                    type="button"
                    disabled={!canConfigure || busy}
                    onClick={() => {
                      setIfoodError("");
                      setIfoodOpen(true);
                    }}
                  >
                    Conectar iFood
                  </button>
                ) : integration.connectable ? (
                  <button
                    type="button"
                    disabled={!canConfigure || busy}
                    onClick={onConnect}
                  >
                    {connection ? "Gerenciar conta" : "Conectar conta"}
                  </button>
                ) : (
                  <button type="button" disabled>
                    {integration.availability === "soon"
                      ? "Ainda não disponível"
                      : "Requer fornecedor/credencial"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {!visible.length ? (
          <div className="pj-empty pj-empty-compact">
            <h3>Nenhuma integração encontrada</h3>
            <p>Revise o termo pesquisado para localizar outra fonte de dados disponível.</p>
            <button type="button" onClick={() => onSearch("")}>Limpar pesquisa</button>
          </div>
        ) : null}
      </section>
      {ifoodOpen ? (
        <Dialog
          title="Integrar iFood"
          close={() => setIfoodOpen(false)}
          busy={ifoodLoading}
          wide
        >
          <div className="pj-ifood-intro">
            <span className="pj-ifood-mark" aria-hidden="true">
              <BrandIcon name="ifood" size={42} />
            </span>
            <div>
              <h3>Vincule o cliente pelo Portal do Parceiro</h3>
              <p>
                O código autoriza a aplicação LAOS no iFood. Nenhum dado de
                pedidos ou Analytics será coletado nesta etapa.
              </p>
            </div>
          </div>
          <ol className="pj-ifood-steps" aria-label="Etapas da integração com o iFood">
            <li><span>1</span><p><strong>Gerar um código de vinculação.</strong><small>O LAOS solicita um código temporário ao iFood.</small></p></li>
            <li><span>2</span><p><strong>Abrir o Portal do Parceiro iFood.</strong><small>Use o botão abaixo para acessar a página oficial.</small></p></li>
            <li><span>3</span><p><strong>Autorizar o acesso da aplicação.</strong><small>Confirme a vinculação dentro do portal.</small></p></li>
            <li><span>4</span><p><strong>Receber um código de autorização.</strong><small>O iFood exibirá esse código após a confirmação.</small></p></li>
            <li><span>5</span><p><strong>Inserir o código no LAOS.</strong><small>A troca por token será habilitada na próxima etapa.</small></p></li>
          </ol>
          {!ifoodCode ? (
            <div className="pj-ifood-generate">
              <p>
                O código expira rapidamente. Gere-o quando estiver pronto para
                abrir o Portal do Parceiro.
              </p>
              <button
                type="button"
                className="primary"
                disabled={ifoodLoading}
                onClick={() => void generateIfoodCode()}
              >
                {ifoodLoading ? "Gerando código…" : "Gerar código de vinculação"}
              </button>
            </div>
          ) : (
            <div className="pj-ifood-code-panel" aria-live="polite">
              <div className="pj-ifood-code-heading">
                <div>
                  <span className="pj-section-label">CÓDIGO DE VINCULAÇÃO</span>
                  <output aria-label="Código de vinculação do iFood">{ifoodCode.userCode}</output>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(ifoodCode.userCode);
                      setIfoodCopied(true);
                      setIfoodError("");
                    } catch {
                      setIfoodError("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.");
                    }
                  }}
                >
                  <InterfaceIcon name="copy" size={18} />
                  Copiar código
                </button>
              </div>
              <p className="pj-ifood-expiration">
                <InterfaceIcon name="calendar" size={18} />
                Expira em aproximadamente {Math.max(1, Math.ceil(ifoodCode.expiresIn / 60))} minutos,
                às {new Date(ifoodCode.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
              </p>
              <a
                className="pj-button primary pj-ifood-portal"
                href={ifoodCode.verificationUrlComplete ?? ifoodCode.verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir Portal do iFood
                <InterfaceIcon name="external" size={18} />
              </a>
              <label>
                Código de autorização
                <input
                  type="text"
                  disabled
                  placeholder="Disponível na próxima etapa"
                />
                <FieldMessage>
                  Após autorizar no portal, a inserção e a troca por token serão implementadas na próxima etapa.
                </FieldMessage>
              </label>
              <button
                type="button"
                disabled={ifoodLoading}
                onClick={() => void generateIfoodCode()}
              >
                {ifoodLoading ? "Gerando outro código…" : "Gerar outro código"}
              </button>
            </div>
          )}
          {ifoodError ? (
            <div className="pj-warning" role="alert">
              <strong>Não foi possível continuar.</strong>
              <p>{ifoodError}</p>
              <button type="button" disabled={ifoodLoading} onClick={() => void generateIfoodCode()}>
                Tentar novamente
              </button>
            </div>
          ) : null}
        </Dialog>
      ) : null}
      {ifoodCopied ? (
        <Toast message="Código do iFood copiado" close={() => setIfoodCopied(false)} />
      ) : null}
    </div>
  );
}
