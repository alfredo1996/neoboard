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

/** The filter line's chip: "Status is disabled", none for everyone. */
export function userStatusFilters(status: UserStatusFilter) {
  return status === "all"
    ? []
    : [{ id: "status" as const, label: "Status", value: status }];
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
