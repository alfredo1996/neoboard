import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { prefetchSchema } from "@/lib/schema-prefetch";
import { updateConnectionSchema } from "@/lib/schemas";
import { validateBody, notFound, handleRouteError } from "@/lib/api-utils";
import { apiSuccess } from "@/lib/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role } = await requireSession();
    const { id } = await params;

    // Owner check first
    let [connection] = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      })
      .from(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .limit(1);

    // Admin fallback: admin can view any connection.
    // TODO(multi-tenancy): connections table lacks tenant_id column, so
    // this lookup is not tenant-scoped. Requires schema migration.
    if (!connection && role === "admin") {
      [connection] = await db
        .select({
          id: connections.id,
          name: connections.name,
          type: connections.type,
          createdAt: connections.createdAt,
          updatedAt: connections.updatedAt,
        })
        .from(connections)
        .where(eq(connections.id, id))
        .limit(1);
    }

    if (!connection) {
      return notFound("Connection not found");
    }

    return apiSuccess(connection);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch connection");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const result = validateBody(updateConnectionSchema, body);
    if (!result.success) return result.response;

    const updates: Record<string, unknown> = {};
    if (result.data.name) updates.name = result.data.name;
    if (result.data.config) updates.configEncrypted = encryptJson(result.data.config);

    const [connection] = await db
      .update(connections)
      .set(updates)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      });

    if (!connection) {
      return notFound();
    }

    // Fire-and-forget: re-warm the schema cache after credential update
    if (result.data.config) {
      prefetchSchema(connection.type as "neo4j" | "postgresql", result.data.config);
    }

    return apiSuccess(connection);
  } catch (error) {
    return handleRouteError(error, "Failed to update connection");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireSession();
    const { id } = await params;

    const deleted = await db
      .delete(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({ id: connections.id });

    if (deleted.length === 0) {
      return notFound();
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete connection");
  }
}
