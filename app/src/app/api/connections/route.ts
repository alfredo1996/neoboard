import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { prefetchSchema } from "@/lib/schema-prefetch";
import { createConnectionSchema } from "@/lib/schemas";
import { validateBody, handleRouteError } from "@/lib/api-utils";
import { apiSuccess, apiList, parsePagination } from "@/lib/api-response";

export async function GET(request: Request) {
  try {
    const { userId, role } = await requireSession();
    const { limit, offset } = parsePagination(request);
    const isAdmin = role === "admin";

    // TODO(multi-tenancy): connections table lacks a tenant_id column.
    // Admin path currently returns all connections in the DB, not scoped
    // to the session tenant. Requires schema migration to add tenant_id
    // to the connections table and backfill existing rows. See issue tracker.
    const whereClause = isAdmin ? undefined : eq(connections.userId, userId);

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(connections)
      .where(whereClause);

    const rows = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      })
      .from(connections)
      .where(whereClause)
      .limit(limit)
      .orderBy(connections.createdAt)
      .offset(offset);

    return apiList(rows, { total: Number(total), limit, offset });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch connections");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireSession();
    const body = await request.json();
    const result = validateBody(createConnectionSchema, body);
    if (!result.success) return result.response;

    const { name, type, config } = result.data;
    const configEncrypted = encryptJson(config);

    const [connection] = await db
      .insert(connections)
      .values({
        userId,
        name,
        type,
        configEncrypted,
      })
      .returning({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        createdAt: connections.createdAt,
      });

    // Fire-and-forget: pre-warm the schema cache for the new connection
    prefetchSchema(type, result.data.config);

    return apiSuccess(connection, 201);
  } catch (error) {
    return handleRouteError(error, "Failed to create connection");
  }
}
