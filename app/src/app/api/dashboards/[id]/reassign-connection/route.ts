import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  validateBody,
  notFound,
  badRequest,
  forbidden,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { reassignConnectionWidgets } from "@/lib/db/connection-reassign";
import { resolveDashboardAccess } from "@/lib/dashboard/access";
import { auditRequest } from "@/lib/audit/audit";

const reassignSchema = z.object({
  /**
   * Source connection *on this dashboard*. Empty or omitted means "widgets
   * that have no connection" — the post-import gap from #1377.
   *
   * That case is the whole reason this endpoint exists alongside the
   * connection-scoped `POST /api/connections/{id}/reassign`: there, the source
   * is a URL path segment, and a path segment cannot express "no connection".
   */
  fromConnectionId: z.string().optional(),
  /**
   * `min(1)` matters: an empty target would mass-UNASSIGN every matching
   * widget on the dashboard rather than repoint it.
   */
  targetConnectionId: z.string().min(1),
});

/**
 * POST /api/dashboards/{id}/reassign-connection
 *
 * Re-points the widgets on ONE dashboard from `fromConnectionId` to
 * `targetConnectionId`, leaving every other dashboard using the same source
 * untouched (#1376). With an empty `fromConnectionId` it fills in widgets left
 * without a connection by an import that skipped one (#1377).
 *
 * Guards:
 *   - `canWrite`
 *   - editor (or better) on the dashboard — it is the resource being written
 *   - target connection must be in-tenant AND (owned OR shared OR caller is
 *     admin), mirroring what /api/query enforces at execution time, so a user
 *     cannot point a widget at a connection they are unable to query
 *   - same connector type as the source, when there IS a real source
 *
 * Ownership of the SOURCE connection is deliberately NOT required: the write
 * target is the dashboard, and in the #1377 case there is no source at all.
 *
 * Query compatibility is NOT validated. Widgets referencing tables or labels
 * that don't exist on the target will simply fail to render at runtime.
 *
 * Response: `{ dashboardsUpdated, widgetsReassigned }`
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, role, canWrite, tenantId } = await requireSession();
    if (!canWrite) return forbidden("Write permission required");
    const { id: dashboardId } = await params;
    const isAdmin = role === "admin";

    const body = await request.json();
    const validation = validateBody(reassignSchema, body);
    if (!validation.success) return validation.response;
    const { targetConnectionId } = validation.data;
    // Omitted and "" mean the same thing: widgets with no connection.
    const fromConnectionId = validation.data.fromConnectionId ?? "";

    // Authorize before validating business rules. `tenantId` comes from the
    // session, never the body.
    const access = await resolveDashboardAccess({
      dashboardId,
      userId,
      tenantId,
      userRole: role,
      required: "editor",
    });
    if (!access) return notFound("Dashboard not found");

    if (fromConnectionId === targetConnectionId) {
      return badRequest("Target connection must be different from source");
    }

    // Target must be one the caller could actually QUERY — not merely one that
    // exists in the tenant. The weaker check would let a user repoint widgets
    // at somebody else's private connection.
    const [target] = await db
      .select({ id: connections.id, type: connections.type })
      .from(connections)
      .where(
        isAdmin
          ? and(
              eq(connections.id, targetConnectionId),
              eq(connections.tenantId, tenantId),
            )
          : and(
              eq(connections.id, targetConnectionId),
              eq(connections.tenantId, tenantId),
              or(
                eq(connections.userId, userId),
                eq(connections.visibility, "shared"),
              ),
            ),
      )
      .limit(1);
    if (!target) return notFound("Target connection not found");

    // The type check needs a real source. After an import that skipped a
    // connection the original connector type is unrecoverable, so there is
    // nothing to compare (#1377).
    if (fromConnectionId !== "") {
      const [source] = await db
        .select({ id: connections.id, type: connections.type })
        .from(connections)
        .where(
          and(
            eq(connections.id, fromConnectionId),
            eq(connections.tenantId, tenantId),
          ),
        )
        .limit(1);
      // A deleted source connection is one of the strongest reasons to repoint
      // widgets, so a missing row is not an error — there is just no type to
      // compare against.
      if (source && source.type !== target.type) {
        return badRequest(
          `Cannot re-assign to a ${target.type} connection — source is ${source.type}`,
        );
      }
    }

    const result = await reassignConnectionWidgets({
      fromConnectionId,
      toConnectionId: targetConnectionId,
      dashboardId,
      userId,
      isAdmin,
      tenantId,
    });

    auditRequest(request, {
      tenantId,
      userId,
      action: "connection.reassign",
      resourceType: "dashboard",
      resourceId: dashboardId,
      details: { fromConnectionId, targetConnectionId, ...result },
    });

    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, "Failed to re-assign dashboard widgets");
  }
}
