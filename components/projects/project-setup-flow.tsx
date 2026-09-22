"use client";

import type { FormEvent, ReactNode } from "react";
import type {
  AgencyClient,
  ProjectClientAccess,
  ProjectClientInvitation,
  ProjectMetaConnection,
} from "@/lib/agency/types";
import type { TeamMember } from "@/lib/team/types";
import { ProjectDetailsFields } from "./project-details-fields";
import { ProjectAccessPanel } from "./project-access-panel";
import { ProjectIntegrations } from "./project-integrations";
import { InterfaceIcon } from "./interface-icon";

const setupSteps = [
  "Dados do projeto",
  "Equipe e acesso",
  "Integrações",
  "Finalização",
] as const;

function SetupFrame({
  step,
  maxStep,
  children,
  onStep,
}: {
  step: 1 | 2 | 3 | 4;
  maxStep: 1 | 2 | 3 | 4;
  children: ReactNode;
  onStep: (step: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="pj-setup">
      <aside className="pj-setup-sidebar">
        <span className="pj-section-label">CONFIGURAÇÃO DO PROJETO</span>
        <h2>Prepare o cliente para a primeira análise</h2>
        <ol className="pj-setup-progress" aria-label="Etapas da configuração">
          {setupSteps.map((label, index) => {
            const itemStep = (index + 1) as 1 | 2 | 3 | 4;
            return (
              <li
                key={label}
                className={
                  itemStep === step
                    ? "active"
                    : itemStep <= maxStep
                      ? "complete"
                      : ""
                }
                aria-current={itemStep === step ? "step" : undefined}
              >
                <button
                  type="button"
                  onClick={() => onStep(itemStep)}
                  disabled={itemStep > maxStep}
                  aria-label={`Etapa ${itemStep}: ${label}`}
                >
                  <span aria-hidden="true">{itemStep < step ? <InterfaceIcon name="check" size={17} /> : itemStep}</span>
                  <strong>{label}</strong>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
      <section className="pj-setup-main">{children}</section>
    </div>
  );
}

export function ProjectSetupFlow({
  project,
  step,
  teamName,
  members,
  clientAccess,
  invitations,
  connection,
  canManageAccess,
  canConfigureIntegration,
  canUnlink,
  busy,
  notice,
  integrationSearch,
  onIntegrationSearch,
  onStep,
  onSaveDetails,
  onManageTeam,
  onInvite,
  onRevokeAccess,
  onRevokeInvitation,
  onConnect,
  onTest,
  onUnlink,
  onAdvance,
  onFinish,
  onExit,
}: {
  project: AgencyClient;
  step: 1 | 2 | 3 | 4;
  teamName: string;
  members: TeamMember[];
  clientAccess: ProjectClientAccess[];
  invitations: ProjectClientInvitation[];
  connection: ProjectMetaConnection | null;
  canManageAccess: boolean;
  canConfigureIntegration: boolean;
  canUnlink: boolean;
  busy: boolean;
  notice: string;
  integrationSearch: string;
  onIntegrationSearch: (value: string) => void;
  onStep: (step: 1 | 2 | 3 | 4) => void;
  onSaveDetails: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onManageTeam: () => void;
  onInvite: (email: string) => Promise<boolean>;
  onRevokeAccess: (userId: string) => Promise<void>;
  onRevokeInvitation: (invitationId: string) => Promise<void>;
  onConnect: () => void;
  onTest: () => void;
  onUnlink: () => void;
  onAdvance: (step: 2 | 3 | 4) => Promise<void>;
  onFinish: (kind: "dashboard" | "report") => Promise<void>;
  onExit: () => void;
}) {
  const connected = connection?.connection_status === "connected";
  const recommendedMissing = [
    !project.contact_email ? "E-mail de contato" : "",
    !project.logo_url ? "Logo do cliente" : "",
  ].filter(Boolean);

  return (
    <SetupFrame
      step={step}
      maxStep={Math.max(step, project.onboarding_step) as 1 | 2 | 3 | 4}
      onStep={onStep}
    >
      {step === 1 ? (
        <form onSubmit={(event) => void onSaveDetails(event)}>
          <span className="pj-section-label">ETAPA 1 DE 4</span>
          <h2>Dados do projeto</h2>
          <p className="pj-setup-intro">
            Estes dados controlam a identificação e a apresentação das análises.
            Você poderá editá-los depois.
          </p>
          <ProjectDetailsFields project={project} />
          {notice ? <div className="pj-warning" role="alert">{notice}</div> : null}
          <div className="pj-actions">
            <button type="button" onClick={onExit}>Sair da configuração</button>
            <button className="accent" disabled={busy}>
              {busy ? "Salvando…" : "Salvar e continuar"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div>
          <span className="pj-section-label">ETAPA 2 DE 4</span>
          <h2>Equipe e acesso</h2>
          <p className="pj-setup-intro">
            Confira os membros internos e convide clientes. Um convite pendente
            será aceito quando o e-mail for cadastrado e confirmado.
          </p>
          <ProjectAccessPanel
            teamName={teamName}
            members={members}
            clientAccess={clientAccess}
            invitations={invitations}
            canManage={canManageAccess}
            busy={busy}
            onManageTeam={onManageTeam}
            onInvite={onInvite}
            onRevokeAccess={onRevokeAccess}
            onRevokeInvitation={onRevokeInvitation}
          />
          {notice ? <div className="pj-feedback" role="status">{notice}</div> : null}
          <div className="pj-actions">
            <button type="button" onClick={() => onStep(1)}>Voltar</button>
            <button
              type="button"
              className="accent"
              disabled={busy}
              onClick={() => void onAdvance(3)}
            >
              {busy ? "Salvando…" : "Continuar para integrações"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <span className="pj-section-label">ETAPA 3 DE 4</span>
          <h2>Integrações</h2>
          <p className="pj-setup-intro">
            Conecte a conta correta. O LAOS só confirma o vínculo depois de
            testar a conta e a permissão de leitura de Insights.
          </p>
          <ProjectIntegrations
            project={project}
            connection={connection}
            canConfigure={canConfigureIntegration}
            canUnlink={canUnlink}
            busy={busy}
            search={integrationSearch}
            onSearch={onIntegrationSearch}
            onConnect={onConnect}
            onTest={onTest}
            onUnlink={onUnlink}
          />
          {notice ? <div className="pj-feedback" role="status">{notice}</div> : null}
          <div className="pj-actions">
            <button type="button" onClick={() => onStep(2)}>Voltar</button>
            <button
              type="button"
              className="accent"
              disabled={busy || !connected}
              onClick={() => void onAdvance(4)}
            >
              {connected ? "Revisar configuração" : "Conecte e teste uma conta"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div>
          <span className="pj-section-label">ETAPA 4 DE 4</span>
          <h2>Configuração pronta para revisão</h2>
          <p className="pj-setup-intro">
            Confira o que será usado no primeiro dashboard ou relatório.
          </p>
          <div className="pj-summary-grid">
            <article className="pj-panel">
              <span className="pj-status-badge connected">Completo</span>
              <h3>Dados do projeto</h3>
              <dl>
                <div><dt>Projeto</dt><dd>{project.name}</dd></div>
                <div><dt>Segmento</dt><dd>{project.segment}</dd></div>
                <div><dt>Unidade</dt><dd>{project.unit}</dd></div>
                <div><dt>Idioma</dt><dd>{project.language}</dd></div>
                <div><dt>Moeda</dt><dd>{project.currency}</dd></div>
                <div><dt>Fuso</dt><dd>{project.timezone}</dd></div>
              </dl>
            </article>
            <article className="pj-panel">
              <span className="pj-status-badge connected">Configurado</span>
              <h3>Equipe e acesso</h3>
              <p>{members.length} membro(s) interno(s)</p>
              <p>{clientAccess.length} cliente(s) com acesso</p>
              <p>{invitations.length} convite(s) pendente(s)</p>
            </article>
            <article className="pj-panel">
              <span className={`pj-status-badge ${connected ? "connected" : "unavailable"}`}>
                {connected ? "Conectado" : "Pendente"}
              </span>
              <h3>Meta Ads</h3>
              <p>{connection?.account_name ?? "Conta não conectada"}</p>
              <small>{connection?.account_id ?? "Vincule uma conta para continuar."}</small>
            </article>
          </div>

          {recommendedMissing.length ? (
            <div className="pj-hint">
              <strong>Dados opcionais ainda não preenchidos:</strong>{" "}
              {recommendedMissing.join(", ")}. Eles não bloqueiam a criação e
              podem ser adicionados depois em Dados do projeto.
            </div>
          ) : null}
          {!connected ? (
            <div className="pj-warning" role="alert">
              A conta Meta ainda não passou no teste de conexão. Volte à etapa
              anterior antes de criar o primeiro documento.
            </div>
          ) : null}
          {notice ? <div className="pj-feedback" role="status">{notice}</div> : null}
          <div className="pj-actions pj-finish-actions">
            <button type="button" onClick={() => onStep(3)}>Voltar</button>
            <div className="pj-inline-actions">
              <button
                type="button"
                disabled={busy || !connected}
                onClick={() => void onFinish("report")}
              >
                Criar relatório
              </button>
              <button
                type="button"
                className="accent"
                disabled={busy || !connected}
                onClick={() => void onFinish("dashboard")}
              >
                {busy ? "Concluindo…" : "Criar primeiro dashboard"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SetupFrame>
  );
}
