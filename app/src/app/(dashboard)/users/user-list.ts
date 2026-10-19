import type { UserListItem } from "@/hooks/use-users";
import type { UserRole } from "@/lib/db/schema";

/** Rows to a page: the DataGrid's size, kept (owner, #2254). */
export const USER_PAGE_SIZE = 20;

export type UserSortColumn = "Name" | "Role" | "Write" | "Created" | "Status";
export interface UserSort {
  column: UserSortColumn;
  direction: "ascending" | "descending";
}
export type UserStatusFilter = "all" | "active" | "disabled";

/** "N people · M disabled" (the mock's page meta). */
export function userListMeta(users: readonly UserListItem[]): string {
  const base = `${users.length} ${users.length === 1 ? "person" : "people"}`;
  const disabled = users.filter((u) => u.disabledAt).length;
  return disabled > 0 ? `${base} · ${disabled} disabled` : base;
}

/** The filter line's chips: the search, then the status; none for "all". */
export function userFilters(status: UserStatusFilter, search: string) {
  const term = search.trim();
  const filters: {
    id: "search" | "status";
    label: string;
    operator?: string;
    value: string;
  }[] = [];
  if (term) {
    filters.push({
      id: "search",
      label: "Name or email",
      operator: "contains",
      value: term,
    });
  }
  if (status !== "all") {
    filters.push({ id: "status", label: "Status", value: status });
  }
  return filters;
}

/** One search over name and email, case-blind; an empty term is everyone. */
export function matchesUserSearch(u: UserListItem, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [u.name, u.email].some((v) => v?.toLowerCase().includes(term));
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  creator: "Creator",
  reader: "Reader",
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

/** Admins always write, readers never, creators as their flag says. */
export function writeLabel(u: UserListItem): string {
  const writes = u.role === "admin" || (u.role !== "reader" && u.canWrite);
  return writes ? "Can write" : "Read only";
}

/**
 * What the row's menu offers for changing a user (the old role select and
 * write switch's rules): nothing on your own row, the other roles elsewhere,
 * write access only for a creator.
 */
export function userMenuActions(
  u: UserListItem,
  isSelf: boolean,
): { roles: UserRole[]; write: "grant" | "revoke" | null } {
  if (isSelf) return { roles: [], write: null };
  const roles = (Object.keys(ROLE_LABELS) as UserRole[]).filter(
    (r) => r !== u.role,
  );
  let write: "grant" | "revoke" | null = null;
  if (u.role === "creator") write = u.canWrite ? "revoke" : "grant";
  return { roles, write };
}

/** "Oct 2", with the year when it is not this one; "—" for none. */
export function formatShortDate(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

const ROLE_ORDER: Record<UserRole, number> = {
  admin: 0,
  creator: 1,
  reader: 2,
};

/** What a column orders by: lower sorts first when ascending. */
function sortKey(u: UserListItem, column: UserSortColumn): string | number {
  switch (column) {
    case "Name":
      // Nameless users sort by email, and those with neither go last.
      return (u.name ?? u.email ?? "￿").toLowerCase();
    case "Role":
      return ROLE_ORDER[u.role];
    case "Write":
      return u.canWrite ? 0 : 1;
    case "Created":
      return Date.parse(u.createdAt) || 0;
    case "Status":
      return u.disabledAt ? 1 : 0;
  }
}

/** A sorted copy; ties keep the list's order. */
export function sortUsers(
  users: readonly UserListItem[],
  { column, direction }: UserSort,
): UserListItem[] {
  const sign = direction === "ascending" ? 1 : -1;
  return [...users].sort((a, b) => {
    const ka = sortKey(a, column);
    const kb = sortKey(b, column);
    if (ka === kb) return 0;
    return ka < kb ? -sign : sign;
  });
}

/** A header click: a new column starts ascending, the same one flips. */
export function nextSort(current: UserSort, column: UserSortColumn): UserSort {
  if (current.column !== column) return { column, direction: "ascending" };
  return {
    column,
    direction: current.direction === "ascending" ? "descending" : "ascending",
  };
}

export function pageOf<T>(items: readonly T[], page: number): T[] {
  return items.slice(page * USER_PAGE_SIZE, (page + 1) * USER_PAGE_SIZE);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / USER_PAGE_SIZE));
}
