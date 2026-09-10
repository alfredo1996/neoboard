import { and, count, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import { decryptJson } from "@/lib/crypto/crypto";
import { fetchConnectionSchema } from "@/lib/connector/schema-prefetch";
import type { ConnectorType } from "@/lib/connector/connector-types";
import type { ConnectionCredentials } from "@/lib/query/query-executor";

/**
 * What a session can see of the tenant's connections. Shared by the REST
 * routes and the MCP tools, so both answer with the same visibility rules.
 */

/**
 * One page of connections. Admin sees every connection in the tenant;
 * everyone else sees their own plus tenant-wide shared ones (#901). Never
 * returns credentials, and never the raw owner id — only `isOwner`.
 */
export async function listConnections(
  session: { userId: string; role: UserRole; tenantId: string },
  page: { limit: number; offset: number },
) {
  const { userId, role, tenantId } = session;
  const { limit, offset } = page;

  const whereClause =
    role === "admin"
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

  // The UI gates edit/delete on ownership (#901).
  const items = rows.map(({ ownerId, ...rest }) => ({
    ...rest,
    isOwner: ownerId === userId,
  }));

  return { items, total: Number(total) };
}

/**
 * Schema of a connection the caller owns or that is shared tenant-wide, or
 * null when there is no such connection. `schema` is itself null for
 * connector types without introspection.
 */
export async function getVisibleConnectionSchema(
  session: { userId: string; tenantId: string },
  connectionId: string,
): Promise<{ schema: unknown } | null> {
  const { userId, tenantId } = session;

  const [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.tenantId, tenantId),
        or(
          eq(connections.userId, userId),
          eq(connections.visibility, "shared"),
        ),
      ),
    )
    .limit(1);

  if (!connection) return null;

  const credentials = decryptJson<ConnectionCredentials>(
    connection.configEncrypted,
  );
  return {
    schema: await fetchConnectionSchema(
      connection.type as ConnectorType,
      credentials,
    ),
  };
}
