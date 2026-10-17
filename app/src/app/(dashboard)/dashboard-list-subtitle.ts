/**
 * Page subtitle for the dashboards list. Adapts to the viewer: creators/admins
 * build dashboards, read-only users only browse the ones shared with them
 * (#1038). Shown while the list is empty; otherwise the meta line counts.
 */
export function dashboardListSubtitle(canCreate: boolean): string {
  return canCreate
    ? "Create and manage your data dashboards"
    : "Browse the dashboards shared with you";
}

/** "N dashboards · M shared with you": shared is every one that is not yours. */
export function dashboardListMeta(total: number, shared: number): string {
  const base = `${total} ${total === 1 ? "dashboard" : "dashboards"}`;
  return shared > 0 ? `${base} · ${shared} shared with you` : base;
}
