import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";

/**
 * Single source of truth for dashboard authorization (#979).
 *
 * Four routes previously re-implemented this with subtle differences
 * (`[id]/route` canAccess, `share/route` requireShareAccess, inline checks
 * in export + duplicate). This consolidates them.
 *
 * Access ladder, lowest → highest: viewer < editor < owner. Admins bypass
 * per-dashboard ACL entirely. Public dashboards grant `viewer` to any
 * authenticated tenant user.
 */
export type DashboardAccessRole = "owner" | "editor" | "viewer" | "admin";

export type RequiredAccess = "viewer" | "editor" | "owner";

export interface DashboardAccess {
  dashboard: typeof dashboards.$inferSelect;
  role: DashboardAccessRole;
}

/**
 * Resolve a user's access to a dashboard at the required level, or null if
 * the dashboard doesn't exist / the user lacks that level. Tenant-scoped.
 */
export async function resolveDashboardAccess(opts: {
  dashboardId: string;
  userId: string;
  tenantId: string;
  userRole: UserRole;
  required: RequiredAccess;
  /**
   * Whether a public dashboard grants viewer access to any tenant user.
   * Default true. `duplicate` passes false — copying is for owned/shared
   * dashboards only, not anything merely visible.
   */
  allowPublic?: boolean;
}): Promise<DashboardAccess | null> {
  const {
    dashboardId,
    userId,
    tenantId,
    userRole,
    required,
    allowPublic = true,
  } = opts;

  const [dashboard] = await db
    .select()
    .from(dashboards)
    .where(
      and(eq(dashboards.id, dashboardId), eq(dashboards.tenantId, tenantId)),
    )
    .limit(1);

  if (!dashboard) return null;

  // Admins bypass per-dashboard ACL.
  if (userRole === "admin") return { dashboard, role: "admin" };

  // Owners have full access.
  if (dashboard.userId === userId) return { dashboard, role: "owner" };

  const [share] = await db
    .select()
    .from(dashboardShares)
    .where(
      and(
        eq(dashboardShares.dashboardId, dashboardId),
        eq(dashboardShares.userId, userId),
        eq(dashboardShares.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!share) {
    // Public dashboards grant read-only (viewer) access to any tenant user.
    if (allowPublic && dashboard.isPublic && required === "viewer") {
      return { dashboard, role: "viewer" };
    }
    return null;
  }

  // A share grants viewer or editor; never owner.
  if (required === "owner") return null;
  if (required === "editor" && share.role === "viewer") return null;

  return { dashboard, role: share.role };
}
