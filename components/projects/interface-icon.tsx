import type { ComponentType } from "react";
import {
  IconArrowBack,
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconCalendar,
  IconChartBar,
  IconChartLine,
  IconCheck,
  IconChevronDown,
  IconClockPlay,
  IconCopy,
  IconMail,
  IconDots,
  IconDownload,
  IconEdit,
  IconExternalLink,
  IconFileDescription,
  IconFilter,
  IconFolders,
  IconGripVertical,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLink,
  IconLogout,
  IconMenu2,
  IconMessageCircle,
  IconMoon,
  IconPlus,
  IconPlugConnected,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShare3,
  IconShoppingCart,
  IconSun,
  IconStar,
  IconStarFilled,
  IconTargetArrow,
  IconTemplate,
  IconTimeline,
  IconTrash,
  IconArrowsDiagonal2,
  IconCalculator,
  IconUser,
  IconUserPlus,
  IconUserShield,
  IconUsersGroup,
  IconX,
  type IconProps,
} from "@tabler/icons-react";

export type InterfaceIconName =
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
  | "close"
  | "collapse"
  | "expand"
  | "moon"
  | "sun"
  | "logout"
  | "user"
  | "chevron-down"
  | "search"
  | "edit"
  | "refresh"
  | "more"
  | "calendar"
  | "share"
  | "copy"
  | "external"
  | "plus"
  | "delete"
  | "download"
  | "filter"
  | "chart-line"
  | "chart-bar"
  | "check"
  | "back"
  | "up"
  | "down"
  | "forward"
  | "sales"
  | "messages"
  | "followers"
  | "link"
  | "invite"
  | "grip"
  | "star"
  | "star-filled"
  | "resize"
  | "calculator"
  | "mail"
  | "automations";

const ICONS: Record<InterfaceIconName, ComponentType<IconProps>> = {
  overview: IconLayoutDashboard,
  projects: IconFolders,
  templates: IconTemplate,
  team: IconUsersGroup,
  dashboards: IconChartBar,
  reports: IconFileDescription,
  integrations: IconPlugConnected,
  timeline: IconTimeline,
  goals: IconTargetArrow,
  settings: IconSettings,
  access: IconUserShield,
  menu: IconMenu2,
  close: IconX,
  collapse: IconLayoutSidebarLeftCollapse,
  expand: IconLayoutSidebarLeftExpand,
  moon: IconMoon,
  sun: IconSun,
  logout: IconLogout,
  user: IconUser,
  "chevron-down": IconChevronDown,
  search: IconSearch,
  edit: IconEdit,
  refresh: IconRefresh,
  more: IconDots,
  calendar: IconCalendar,
  share: IconShare3,
  copy: IconCopy,
  external: IconExternalLink,
  plus: IconPlus,
  delete: IconTrash,
  download: IconDownload,
  filter: IconFilter,
  "chart-line": IconChartLine,
  "chart-bar": IconChartBar,
  check: IconCheck,
  back: IconArrowBack,
  up: IconArrowUp,
  down: IconArrowDown,
  forward: IconArrowRight,
  sales: IconShoppingCart,
  messages: IconMessageCircle,
  followers: IconUserPlus,
  link: IconLink,
  invite: IconUserPlus,
  grip: IconGripVertical,
  star: IconStar,
  "star-filled": IconStarFilled,
  resize: IconArrowsDiagonal2,
  calculator: IconCalculator,
  mail: IconMail,
  automations: IconClockPlay,
};

export function InterfaceIcon({
  name,
  size = 20,
  stroke = 1.8,
  ...props
}: Omit<IconProps, "name"> & { name: InterfaceIconName }) {
  const Icon = ICONS[name];
  return <Icon size={size} stroke={stroke} aria-hidden="true" focusable="false" {...props} />;
}
