import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { encryptJson, decryptJson } from "@/lib/crypto/crypto";
import { prefetchSchema } from "@/lib/connector/schema-prefetch";
import { closeConnection } from "@/lib/query/query-executor";
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { updateConnectionSchema } from "@/lib/shared/schemas";
import type { ConnectorType } from "@/lib/connector/connector-types";
import {
  validateBody,
  notFound,
  forbidden,
  handleRouteError,
  badRequest,
} from "@/lib/api/api-utils";
import { apiSuccess, apiError } from "@/lib/api/api-response";
import { getConnectionUsage } from "@/lib/db/connection-usage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId, role } = await requireSession();
    const { id } = await params;

    // Owner-or-shared check first (tenant-scoped, #901). Password is
    // stripped below either way; shared users get metadata only.
    let [connection] = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        configEncrypted: connections.configEncrypted,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
        visibility: connections.visibility,
        ownerId: connections.userId,
      })
      .from(connections)
      .where(
        and(
          eq(connections.id, id),
          eq(connections.tenantId, tenantId),
          or(
            eq(connections.userId, userId),
            eq(connections.visibility, "shared"),
          ),
        ),
      )
      .limit(1);

    // Admin fallback: admin can view any connection in the same tenant.
    if (!connection && role === "admin") {
      [connection] = await db
        .select({
          id: connections.id,
          name: connections.name,
          type: connections.type,
          configEncrypted: connections.configEncrypted,
          createdAt: connections.createdAt,
          updatedAt: connections.updatedAt,
          visibility: connections.visibility,
          ownerId: connections.userId,
        })
        .from(connections)
        .where(and(eq(connections.id, id), eq(connections.tenantId, tenantId)))
        .limit(1);
    }

    if (!connection) {
      return notFound("Connection not found");
    }

    // Decrypt config and strip password before returning. ownerId never
    // leaves the server — the UI gates editing on isOwner (#901).
    const { configEncrypted, ownerId, ...metadata } = connection;
    const shapedMetadata = { ...metadata, isOwner: ownerId === userId };
    let config: Record<string, unknown> | undefined;
    if (configEncrypted) {
      try {
        const decrypted = decryptJson<Record<string, unknown>>(configEncrypted);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip password from response
        const { password, ...safeConfig } = decrypted;
        config = safeConfig;
      } catch {
        // Corrupted or legacy encrypted config — return metadata without config
        config = undefined;
      }
    }

    return apiSuccess({ ...shapedMetadata, config });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch connection");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId, role } = await requireSession();
    assertCanManageConnections(role);
    const { id } = await params;
    const body = await request.json();
    const result = validateBody(updateConnectionSchema, body);
    if (!result.success) return result.response;

    const updates: Record<string, unknown> = {};
    if (result.data.name) updates.name = result.data.name;

    // Visibility changes are admin-only (#901 'admin provisions' model) —
    // and the update where-clause below keeps them owner-scoped, so an
    // admin shares connections they own.
    if (result.data.visibility) {
      if (role !== "admin") {
        return forbidden("Only admins can change connection visibility");
      }
      updates.visibility = result.data.visibility;
    }

    // Fetch the existing row — needed for password merge and cache eviction.
    let oldCredentials: ConnectionCredentials | null = null;
    let finalConfig = result.data.config;

    if (finalConfig) {
      const [existing] = await db
        .select({
          configEncrypted: connections.configEncrypted,
          type: connections.type,
        })
        .from(connections)
        .where(
          and(
            eq(connections.id, id),
            eq(connections.userId, userId),
            eq(connections.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (existing?.configEncrypted) {
        try {
          const prev = decryptJson<ConnectionCredentials>(
            existing.configEncrypted,
          );
          oldCredentials = prev;
          if (!finalConfig.password) {
            finalConfig = { ...finalConfig, password: prev.password };
          }
        } catch {
          // Stored config is corrupted/unreadable — user must re-enter password
          return badRequest(
            "Stored credentials could not be decrypted. Please re-enter the password.",
          );
        }
      }

      updates.configEncrypted = encryptJson(finalConfig);
    }

    const [connection] = await db
      .update(connections)
      .set(updates)
      .where(
        and(
          eq(connections.id, id),
          eq(connections.userId, userId),
          eq(connections.tenantId, tenantId),
        ),
      )
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

    // Evict the old cached driver so stale credentials aren't reused
    if (oldCredentials) {
      closeConnection(connection.type as ConnectorType, oldCredentials);
    }

    // Fire-and-forget: re-warm the schema cache after credential update
    if (finalConfig?.password) {
      prefetchSchema(
        connection.type as ConnectorType,
        finalConfig as { uri: string; username: string; password: string },
      );
    }

    return apiSuccess(connection);
  } catch (error) {
    return handleRouteError(error, "Failed to update connection");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;
    const isAdmin = role === "admin";

    // `?force=true` bypasses the in-use guard. Used by the UI's
    // "Delete anyway" button after the creator has seen the usage
    // breakdown, and by CLI/automation that accept the data-loss tradeoff.
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";

    // Before deleting, check whether any dashboard widget still
    // references this connection. If so — and the caller hasn't
    // acknowledged by passing `?force=true` — return 409 Conflict with
    // the full usage breakdown so the client can render a warning.
    //
    // Tenant-scoped: creators see their own dashboards + shared +
    // public; admins see every dashboard in their tenant.
    if (!force) {
      const usage = await getConnectionUsage(id, userId, isAdmin, tenantId);
      if (usage.widgetCount > 0) {
        return apiError(
          "CONFLICT",
          `Connection is in use by ${usage.widgetCount} widget${
            usage.widgetCount === 1 ? "" : "s"
          } across ${usage.dashboards.length} dashboard${
            usage.dashboards.length === 1 ? "" : "s"
          }`,
          { usage },
        );
      }
    }

    // Ownership check is enforced by the WHERE clause below. Admins
    // bypass the owner constraint but still require tenant match.
    const whereClause = isAdmin
      ? and(eq(connections.id, id), eq(connections.tenantId, tenantId))
      : and(
          eq(connections.id, id),
          eq(connections.userId, userId),
          eq(connections.tenantId, tenantId),
        );

    // Fetch credentials before deletion so we can evict the cached driver
    const [toDelete] = await db
      .select({
        type: connections.type,
        configEncrypted: connections.configEncrypted,
      })
      .from(connections)
      .where(whereClause)
      .limit(1);

    const deleted = await db
      .delete(connections)
      .where(whereClause)
      .returning({ id: connections.id });

    if (deleted.length === 0) {
      return notFound();
    }

    // Evict the cached driver so the connection pool is closed
    if (toDelete?.configEncrypted) {
      try {
        const creds = decryptJson<ConnectionCredentials>(
          toDelete.configEncrypted,
        );
        closeConnection(toDelete.type as ConnectorType, creds);
      } catch {
        // Corrupted credentials — nothing to evict
      }
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete connection");
  }
}
