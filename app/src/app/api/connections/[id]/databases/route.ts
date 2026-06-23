import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto/crypto";
import { listDatabases } from "@/lib/query/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query/query-executor";
import { apiSuccess } from "@/lib/api/api-response";
import { notFound, handleRouteError } from "@/lib/api/api-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId } = await requireSession();
    const { id } = await params;

    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, id),
          or(
            eq(connections.userId, userId),
            eq(connections.visibility, "shared"),
          ),
          eq(connections.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    try {
      const databases = await listDatabases(
        connection.type as DbType,
        credentials,
      );
      return apiSuccess({ databases });
    } catch {
      return apiSuccess({ databases: [] });
    }
  } catch (error) {
    return handleRouteError(error, "Failed to list databases");
  }
}
