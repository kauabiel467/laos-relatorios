import type { IconProps } from "@tabler/icons-react";
import { InterfaceIcon, type InterfaceIconName } from "./interface-icon";

export type WorkspaceNavIconName = Extract<InterfaceIconName,
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
  | "close">;

export function WorkspaceNavIcon({
  name,
  ...props
}: Omit<IconProps, "name"> & { name: WorkspaceNavIconName }) {
  return <InterfaceIcon name={name} {...props} />;
}
