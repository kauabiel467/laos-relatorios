/* eslint-disable @next/next/no-img-element */
import type { RefObject } from "react";
import type { AgencyClient } from "@/lib/agency/types";
import type { WorkspaceView } from "@/lib/projects/routes";
import { WorkspaceNavIcon, type WorkspaceNavIconName } from "./workspace-nav-icon";
import { InterfaceIcon } from "./interface-icon";

export type GlobalNavItem = {
  label: string;
  icon: WorkspaceNavIconName;
  active: boolean;
  values: Record<string, string>;
  visible?: boolean;
};

export type ProjectNavItem = {
  label: string;
  icon: WorkspaceNavIconName;
  view: WorkspaceView;
  visible?: boolean;
};

export function WorkspaceShell({
  theme,
  sidebarOpen,
  sidebarCollapsed,
  accountMenuOpen,
  accountMenuRef,
  project,
  cid,
  view,
  isStaff,
  userName,
  workspaceLabel,
  globalNavigation,
  projectNavigation,
  pageTitle,
  pageContext,
  onNavigate,
  onCloseSidebar,
  onOpenSidebar,
  onToggleSidebarCollapse,
  onToggleAccountMenu,
  onOpenTeamSettings,
  onToggleTheme,
  onSignOut,
}: {
  theme: "dark" | "light";
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  accountMenuOpen: boolean;
  accountMenuRef: RefObject<HTMLDivElement | null>;
  project: AgencyClient | undefined;
  cid: string;
  view: WorkspaceView;
  isStaff: boolean;
  userName: string;
  workspaceLabel: string;
  globalNavigation: GlobalNavItem[];
  projectNavigation: ProjectNavItem[];
  pageTitle: string;
  pageContext: string;
  onNavigate: (values: Record<string, string>) => void;
  onCloseSidebar: () => void;
  onOpenSidebar: () => void;
  onToggleSidebarCollapse: () => void;
  onToggleAccountMenu: () => void;
  onOpenTeamSettings: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <a className="pj-skip-link" href="#workspace-main">Pular para o conteúdo</a>
      {sidebarOpen ? (
        <button className="pj-sidebar-backdrop" aria-label="Fechar menu" onClick={onCloseSidebar} />
      ) : null}
      <aside
        id="workspace-sidebar"
        className={`pj-sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Navegação principal"
      >
        <div className="pj-sidebar-header">
          <button className="pj-brand" aria-label="Ir para meus projetos" onClick={() => onNavigate({})}>
            <span className="pj-brand-mark" aria-hidden="true">la</span>
            <span className="pj-brand-copy">
              <strong>laos</strong>
              <small>relatórios</small>
            </span>
          </button>
          <button
            className="pj-sidebar-collapse"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-pressed={sidebarCollapsed}
            onClick={onToggleSidebarCollapse}
          >
            <InterfaceIcon name={sidebarCollapsed ? "expand" : "collapse"} />
          </button>
          <button className="pj-sidebar-close" aria-label="Fechar menu" onClick={onCloseSidebar}>
            <WorkspaceNavIcon name="close" />
          </button>
        </div>

        <div className="pj-sidebar-scroll">
          <span className="pj-sidebar-label">Workspace</span>
          <nav className="pj-global-nav" aria-label="Navegação do workspace">
            {globalNavigation
              .filter((item) => item.visible !== false)
              .map((item) => (
                <button
                  key={item.label}
                  className={item.active ? "active" : ""}
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => onNavigate(item.values)}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <WorkspaceNavIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
          </nav>

          {project ? (
            <div className="pj-sidebar-project">
              <span className="pj-sidebar-label">Projeto ativo</span>
              <button
                className="pj-active-project"
                title={`Abrir visão geral de ${project.name}`}
                aria-label={`Projeto ativo: ${project.name}. Abrir visão geral.`}
                onClick={() => onNavigate({ project: cid })}
              >
                <span className="pj-project-avatar" aria-hidden="true">
                  {project.logo_url ? <img src={project.logo_url} alt="" /> : project.name.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.segment || "Projeto de mídia"}</small>
                </span>
              </button>
              <nav className="pj-sidebar-project-nav" aria-label={`Áreas de ${project.name}`}>
                {projectNavigation
                  .filter((item) => item.visible !== false)
                  .map((item) => (
                    <button
                      key={item.view}
                      className={view === item.view ? "active" : ""}
                      aria-current={view === item.view ? "page" : undefined}
                      onClick={() => onNavigate({ project: cid, view: item.view })}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <WorkspaceNavIcon name={item.icon} />
                      <span>{item.label}</span>
                    </button>
                  ))}
              </nav>
            </div>
          ) : null}
        </div>

        <div className="pj-sidebar-footer" ref={accountMenuRef}>
          <button
            type="button"
            className="pj-account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            title={sidebarCollapsed ? "Abrir menu da conta" : undefined}
            onClick={onToggleAccountMenu}
          >
            <span className="pj-small-avatar">{userName.slice(0, 1).toUpperCase() || "L"}</span>
            <span className="pj-sidebar-user">
              <strong>{userName || "Minha conta"}</strong>
              <small>{workspaceLabel}</small>
            </span>
          </button>
          {accountMenuOpen ? (
            <div className="pj-account-menu" role="menu" aria-label="Menu da conta">
              <div className="pj-account-menu-identity">
                <span className="pj-small-avatar">{userName.slice(0, 1).toUpperCase() || "L"}</span>
                <span>
                  <strong>{userName || "Minha conta"}</strong>
                  <small>{workspaceLabel}</small>
                </span>
              </div>
              {isStaff ? (
                <button type="button" role="menuitem" onClick={onOpenTeamSettings}>
                  <InterfaceIcon name="settings" size={18} />
                  Configurações
                </button>
              ) : null}
              <div className="pj-account-menu-separator" role="separator" />
              <button type="button" role="menuitem" className="danger" onClick={onSignOut}>
                <InterfaceIcon name="logout" size={18} />
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </aside>
      <header className="pj-topnav">
        <button
          className="pj-mobile-menu"
          aria-label="Abrir menu"
          aria-controls="workspace-sidebar"
          aria-expanded={sidebarOpen}
          onClick={onOpenSidebar}
        >
          <WorkspaceNavIcon name="menu" />
        </button>
        <div className="pj-topbar-context">
          <strong>{pageTitle}</strong>
          <span>{pageContext}</span>
        </div>
        <div className="pj-account">
          <button
            className="pj-theme-toggle"
            aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
            onClick={onToggleTheme}
          >
            <InterfaceIcon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </div>
      </header>
    </>
  );
}
