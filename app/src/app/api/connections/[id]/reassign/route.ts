import { z } from "zod";
import { and, eq } from "drizzle-orm";
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
import { auditRequest } from "@/lib/audit/audit";

const reassignSchema = z.object({
  targetConnectionId: z.string().min(1),
});

/**
 * POST /api/connections/{id}/reassign
 *
 * Re-assigns every widget that references `id` (source) to
 * `targetConnectionId` across all dashboards the caller can edit.
 *
 * Guards:
 *   - Source connection must exist and be owned by the caller (or the
 *     caller must be an admin in the same tenant).
 *   - Target connection must exist in the same tenant.
 *   - Target must be the same `type` as source — Cypher queries won't
 *     work on a PostgreSQL connection and vice versa.
 *
 * Query compatibility is NOT validated. Widgets referencing tables or
 * nodes that don't exist on the target connection will simply fail to
 * render at runtime — same as any other broken query.
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
    const { id } = await params;
    const isAdmin = role === "admin";

    const body = await request.json();
    const validation = validateBody(reassignSchema, body);
    if (!validation.success) return validation.response;
    const { targetConnectionId } = validation.data;

    if (targetConnectionId === id) {
      return badRequest("Target connection must be different from source");
    }

    // Source ownership (or admin + same tenant)
    const [source] = await db
      .select({ id: connections.id, type: connections.type })
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
    if (!source) return notFound("Connection not found");

    // Target must exist in the same tenant; owner doesn't have to match
    // (admin can point at anyone's connection, and non-admins can point
    // at a connection shared to them via a dashboard — we only enforce
    // tenant isolation here). The type check below is the real safety.
    const [target] = await db
      .select({ id: connections.id, type: connections.type })
      .from(connections)
      .where(
        and(
          eq(connections.id, targetConnectionId),
          eq(connections.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!target) return notFound("Target connection not found");

    if (source.type !== target.type) {
      return badRequest(
        `Cannot re-assign to a ${target.type} connection — source is ${source.type}`,
      );
    }

    const result = await reassignConnectionWidgets(
      id,
      targetConnectionId,
      userId,
      isAdmin,
      tenantId,
    );

    auditRequest(request, {
      tenantId,
      userId,
      action: "connection.reassign",
      resourceType: "connection",
      resourceId: id,
      details: { targetConnectionId, ...result },
    });

    return apiSuccess(result);
  } catch (error) {
    return handleRouteError(error, "Failed to re-assign connection widgets");
  }
}
