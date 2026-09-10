import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { encryptJson } from "@/lib/crypto/crypto";
import { prefetchSchema } from "@/lib/connector/schema-prefetch";
import { listConnections } from "@/lib/connector/visible-connections";
import { createConnectionSchema } from "@/lib/shared/schemas";
import { validateBody, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess, apiList, parsePagination } from "@/lib/api/api-response";
import { auditRequest } from "@/lib/audit/audit";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { limit, offset } = parsePagination(request);
    const { items, total } = await listConnections(session, { limit, offset });
    return apiList(items, { total, limit, offset });
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
