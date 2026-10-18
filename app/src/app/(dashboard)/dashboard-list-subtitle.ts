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

/** "N dashboards · M shared with you": M counts the dashboards a share names you on (the API's `shared`), not public ones nobody shared. */
export function dashboardListMeta(total: number, shared: number): string {
  const base = `${total} ${total === 1 ? "dashboard" : "dashboards"}`;
  return shared > 0 ? `${base} · ${shared} shared with you` : base;
}

/** One active filter on the dashboards list, as the kit's `FilterLine` reads it. */
export interface DashboardListFilter {
  id: "name" | "owner";
  label: string;
  operator?: string;
  value: string;
}

/** The filter line's chips: the trimmed search as "Name contains", and "Owner is you" when Only mine is on. */
export function dashboardListFilters(
  search: string,
  onlyMine: boolean,
): DashboardListFilter[] {
  const filters: DashboardListFilter[] = [];
  const term = search.trim();
  if (term) {
    filters.push({
      id: "name",
      label: "Name",
      operator: "contains",
      value: term,
    });
  }
  if (onlyMine) filters.push({ id: "owner", label: "Owner", value: "you" });
  return filters;
}

/** The list's counts: dashboards a share names you on (the API's `shared`), and widgets summed. */
export function dashboardListTotals(
  list: readonly { shared?: boolean; widgetCount?: number }[] | undefined,
): { sharedCount: number; widgetTotal: number } {
  let sharedCount = 0;
  let widgetTotal = 0;
  for (const d of list ?? []) {
    if (d.shared) sharedCount += 1;
    widgetTotal += d.widgetCount ?? 0;
  }
  return { sharedCount, widgetTotal };
}
