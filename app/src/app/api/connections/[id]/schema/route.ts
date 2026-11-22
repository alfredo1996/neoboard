import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { canManageConnections } from "@/lib/auth/can-write";
import { usableConnection } from "@/lib/db/connection-access";
import { decryptJson } from "@/lib/crypto/crypto";
import { fetchConnectionSchema } from "@/lib/connector/schema-prefetch";
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { apiSuccess } from "@/lib/api/api-response";
import { notFound, handleRouteError } from "@/lib/api/api-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId, role } = await requireSession();
    const { id } = await params;

    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, id),
          eq(connections.tenantId, tenantId),
          usableConnection(userId, role),
        ),
      )
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    const schema = await fetchConnectionSchema(connection.type, credentials, {
      tenantId,
      connectionId: connection.id,
      configEncrypted: connection.configEncrypted,
      // The editor's Refresh reads the database again (#2514), for a role that
      // manages connections; for any other it is ignored (#2534).
      refresh:
        canManageConnections(role) &&
        new URL(request.url).searchParams.get("refresh") === "1",
    });

    return apiSuccess(schema);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch schema");
  }
}
