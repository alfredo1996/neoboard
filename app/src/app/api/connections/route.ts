import { and, count, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { encryptJson } from "@/lib/crypto/crypto";
import { prefetchSchema } from "@/lib/connector/schema-prefetch";
import { createConnectionSchema } from "@/lib/shared/schemas";
import { validateBody, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess, apiList, parsePagination } from "@/lib/api/api-response";
import { auditRequest } from "@/lib/audit/audit";

export async function GET(request: Request) {
  try {
    const { userId, tenantId, role } = await requireSession();
    const { limit, offset } = parsePagination(request);
    const isAdmin = role === "admin";

    // Admin sees all connections in the tenant; non-admin sees own plus
    // tenant-wide shared ones (#901).
    const whereClause = isAdmin
      ? eq(connections.tenantId, tenantId)
      : and(
          eq(connections.tenantId, tenantId),
          or(
            eq(connections.userId, userId),
            eq(connections.visibility, "shared"),
          ),
        );

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(connections)
      .where(whereClause);

    const rows = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        allowPerCardDb: connections.allowPerCardDb,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
        visibility: connections.visibility,
        ownerId: connections.userId,
      })
      .from(connections)
      .where(whereClause)
      .limit(limit)
      .orderBy(connections.createdAt)
      .offset(offset);

    // Expose ownership as a boolean — the UI gates edit/delete on it (#901).
    // Never leak the raw owner id to non-admins.
    const shaped = rows.map(({ ownerId, ...rest }) => ({
      ...rest,
      isOwner: ownerId === userId,
    }));

    return apiList(shaped, { total: Number(total), limit, offset });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch connections");
  }
}

export async function POST(request: Request) {
  try {
    const { userId, tenantId, role } = await requireSession();
    assertCanManageConnections(role);
    const body = await request.json();
    const result = validateBody(createConnectionSchema, body);
    if (!result.success) return result.response;

    const { name, type, config } = result.data;
    const configEncrypted = encryptJson(config);

    const [connection] = await db
      .insert(connections)
      .values({
        userId,
        tenantId,
        name,
        type,
        configEncrypted,
      })
      .returning({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        allowPerCardDb: connections.allowPerCardDb,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      });

    // Fire-and-forget: pre-warm the schema cache for the new connection
    prefetchSchema(type, result.data.config);

    auditRequest(request, {
      tenantId,
      userId,
      action: "connection.create",
      resourceType: "connection",
      resourceId: connection.id,
      // Never the config — it holds credentials.
      details: { name, connectorType: type },
    });

    return apiSuccess(connection, 201);
  } catch (error) {
    return handleRouteError(error, "Failed to create connection");
  }
}
