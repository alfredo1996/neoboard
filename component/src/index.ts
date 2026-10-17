// Atomic UI Components (Phase 1-5)
export * from "./components/ui";

// Composed Components (Phase 6+)
export * from "./components/composed";

// Page kit (#2225). Its PageHeader is not re-exported here: the old
// composed PageHeader keeps that name until the app pages move to the kit.
export {
  PRODUCT_NAME,
  Wordmark,
  FilterLine,
  List,
  ListRow,
  SettingsSection,
  Stat,
  Sidebar,
  SIDEBAR_COLLAPSED_KEY,
  AppShell,
  type WordmarkProps,
  type FilterLineProps,
  type FilterLineFilter,
  type ListProps,
  type ListRowProps,
  type SettingsSectionProps,
  type StatProps,
  type SidebarProps,
  type SidebarGroup,
  type SidebarItem,
  type SidebarAccount,
  type AppShellProps,
} from "./components/kit";

// Chart Components (Phase 10+)
export * from "./charts";

// Custom Hooks
export * from "./hooks";

// Utility Functions
export * from "./utils";

// Parameter labels (#2213)
export { humanizeParamName } from "./lib/humanize-param-name";
