"use client";

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
import { MetaMark, shortDate } from "./ui";

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
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const visible = PROJECT_INTEGRATIONS.filter((integration) =>
    `${integration.name} ${integration.description}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedSearch),
  );
  const isConnected = connection?.connection_status === "connected";

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
                    onClick={() => {
                      if (
                        window.confirm(
                          "Desvincular a Meta deste projeto? Dashboards e relatórios salvos serão preservados.",
                        )
                      ) {
                        onUnlink();
                      }
                    }}
                  >
                    Desvincular
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
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
                className={`pj-integration-card ${metaConnected ? "connected" : ""}`}
                key={integration.id}
              >
                <div className="pj-integration-card-header">
                  <span style={{ background: integration.color }} aria-hidden="true">
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
                {integration.connectable ? (
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
            <p>Tente outro nome ou canal.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
