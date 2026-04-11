import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { notFound, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { getConnectionUsage } from "@/lib/db/connection-usage";

/**
 * GET /api/connections/{id}/usage
 *
 * Returns a breakdown of how many widgets on how many dashboards reference
 * the given connection. Used by the UI's delete-connection confirm dialog
 * so creators see the blast radius BEFORE they click Delete (issue #508).
 *
 * The same usage shape is also returned in the 409 response from
 * DELETE /api/connections/{id} when the caller hasn't passed `?force=true`
 * (issue #509), so the two responses are structurally identical.
 *
 * Permissions:
 *   - Connection must exist and belong to the caller (or the caller is admin)
 *   - Tenant-scoped both at the connection lookup AND the usage query
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    // Ownership check — admins bypass, creators must own the connection.
    const isAdmin = role === "admin";
    const [connection] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(
        isAdmin
          ? and(eq(connections.id, id), eq(connections.tenantId, tenantId))
          : and(
              eq(connections.id, id),
              eq(connections.userId, userId),
              eq(connections.tenantId, tenantId),
            ),
      )
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    const usage = await getConnectionUsage(id, userId, isAdmin, tenantId);
    return apiSuccess(usage);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch connection usage");
  }
}
