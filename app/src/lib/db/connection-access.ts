import { and, eq, inArray, not, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, users } from "@/lib/db/schema";
import type { DashboardLayout, UserRole } from "@/lib/db/schema";
import { migrateLayout } from "@/lib/dashboard/migrate-layout";

/**
 * Who may use a connection directly: its owner, anyone in the tenant once it
 * is shared (#901), and an admin, for whom there is no restriction
 * (`undefined`, which `and()` drops). The rule /api/query applies before any
 * dashboard grant. Callers add their own tenant filter beside it.
 */
export function usableConnection(
  userId: string,
  role: UserRole,
): SQL | undefined {
  if (role === "admin") return undefined;
  return or(
    eq(connections.userId, userId),
    eq(connections.visibility, "shared"),
  );
}

/** Every connection id a layout's widgets name, from a v1 or v2 layout. */
export function layoutConnectionIds(layout: unknown): Set<string> {
  const ids = new Set<string>();
  for (const page of migrateLayout(layout as DashboardLayout | null).pages) {
    // Stored JSON is not re-validated on read, so a page may lack widgets.
    for (const widget of page.widgets ?? []) {
      if (widget.connectionId) ids.add(widget.connectionId);
    }
  }
  return ids;
}

/**
 * The ids, among `ids`, of connections in the caller's tenant that the caller
 * cannot use directly. A dashboard that names a connection lets its owner and
 * editors run any read query on it (#972), so no write may hand a caller a
 * dashboard on one of these (#1816). An id that matches no connection grants
 * nothing and is not returned.
 */
export async function unusableConnectionIds(
  ids: Iterable<string>,
  session: { userId: string; tenantId: string; role: UserRole },
): Promise<string[]> {
  const wanted = [...new Set(ids)];
  const usable = usableConnection(session.userId, session.role);
  if (wanted.length === 0 || !usable) return [];
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.tenantId, session.tenantId),
        inArray(connections.id, wanted),
        not(usable),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * The ids, among `ids`, of connections a dashboard's owner cannot use directly,
 * judged by the owner's role as it is now, not when the dashboard was saved.
 * The dashboard's owner and editors author on a connection only while the owner
 * can use it (#972, #1816).
 */
export async function unusableByOwner(
  ids: Iterable<string>,
  ownerId: string,
  tenantId: string,
): Promise<string[]> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return [];
  const [owner] = await db
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, ownerId), eq(users.tenantId, tenantId)))
    .limit(1);
  // ponytail: a missing owner row counts as a non-admin, the safe side.
  const role = owner?.role ?? "creator";
  return unusableConnectionIds(wanted, { userId: ownerId, tenantId, role });
}
