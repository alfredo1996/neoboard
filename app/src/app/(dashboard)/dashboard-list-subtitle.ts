/**
 * Page subtitle for the dashboards list. Adapts to the viewer: creators/admins
 * build dashboards, read-only users only browse the ones shared with them
 * (#1038).
 */
export function dashboardListSubtitle(canCreate: boolean): string {
  return canCreate
    ? "Create and manage your data dashboards"
    : "Browse the dashboards shared with you";
}
