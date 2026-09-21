import type { ReactNode, SVGProps } from "react";

export type WorkspaceNavIconName =
  | "overview"
  | "projects"
  | "templates"
  | "team"
  | "dashboards"
  | "reports"
  | "integrations"
  | "timeline"
  | "goals"
  | "settings"
  | "access"
  | "menu"
  | "close";

const paths: Record<WorkspaceNavIconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="4" rx="2" /><rect x="14" y="11" width="7" height="10" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /></>,
  projects: <><path d="M3 7.5h7l2 2h9v9.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V7.5Z" /><path d="M3 7.5V5.25A2.25 2.25 0 0 1 5.25 3h4.2l2 2H18.75A2.25 2.25 0 0 1 21 7.25V9.5" /></>,
  templates: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 12h7M8 16h7" /></>,
  team: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2.2A4.8 4.8 0 0 1 8.3 13h1.4a4.8 4.8 0 0 1 4.8 4.8V20M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4V20" /></>,
  dashboards: <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />,
  reports: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 13h7M8 17h5" /></>,
  integrations: <path d="M8.5 12.5 5 16a2.8 2.8 0 1 0 4 4l3.5-3.5M15.5 11.5 19 8a2.8 2.8 0 1 0-4-4l-3.5 3.5M8.5 15.5l7-7" />,
  timeline: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m15 9 6-6M17 3h4v4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 15.2a1.8 1.8 0 0 0 .36 2l-2.16 2.16a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V21h-4.2v-.35A1.8 1.8 0 0 0 8.8 19a1.8 1.8 0 0 0-2 .36L4.64 17.2a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.65-1.1H3V9.9h.35A1.8 1.8 0 0 0 5 8.8a1.8 1.8 0 0 0-.36-2L6.8 4.64a1.8 1.8 0 0 0 2 .36 1.8 1.8 0 0 0 1.1-1.65V3h4.2v.35A1.8 1.8 0 0 0 15.2 5a1.8 1.8 0 0 0 2-.36l2.16 2.16a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.65 1.1H21v4.2h-.35A1.8 1.8 0 0 0 19 15.2Z" /></>,
  access: <><path d="M12 3 4.5 6v5c0 4.8 3.2 8.4 7.5 10 4.3-1.6 7.5-5.2 7.5-10V6L12 3Z" /><path d="M9 12.5 11 14.5 15.5 10" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};

export function WorkspaceNavIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: WorkspaceNavIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
