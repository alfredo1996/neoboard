import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { encryptJson, decryptJson } from "@/lib/crypto/crypto";
import { prefetchSchema } from "@/lib/connector/schema-prefetch";
import { closeConnection } from "@/lib/query/query-executor";
import { forgetDeadConnector } from "@/lib/query/middleware/dead-connector";
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { updateConnectionSchema } from "@/lib/shared/schemas";
import { auditRequest } from "@/lib/audit/audit";
import {
  validateBody,
  notFound,
  forbidden,
  handleRouteError,
  badRequest,
} from "@/lib/api/api-utils";
import { apiSuccess, apiError } from "@/lib/api/api-response";
import { getConnectionUsage } from "@/lib/db/connection-usage";
import { getConnector } from "@/lib/connector/connection-adapter";
import {
  redactConfig,
  validateConnectionConfig,
} from "@/lib/connector/connection-config";

/** The stored config — `undefined` when it cannot be decrypted (rotated or lost key). */
function readStoredConfig(
  configEncrypted: string,
): ConnectionCredentials | undefined {
  try {
    return decryptJson<ConnectionCredentials>(configEncrypted);
  } catch {
    return undefined;
  }
}

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

    // Decrypt the config and return only what the connector's descriptor
    // declares, minus EVERY secret it declares (#1901) — this feeds the edit
    // and Duplicate dialogs, so no secret may ride along. ownerId never leaves
    // the server — the UI gates editing on isOwner (#901).
    const { configEncrypted, ownerId, ...metadata } = connection;
    const shapedMetadata = { ...metadata, isOwner: ownerId === userId };
    // Corrupted or legacy encrypted config — return metadata without config.
    const stored = configEncrypted
      ? readStoredConfig(configEncrypted)
      : undefined;
    const config =
      stored && redactConfig(getConnector(connection.type), stored);

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

    // Fetch the existing row — needed for the secret merge, the connector
    // type that decides what a valid config is, and cache eviction.
    let oldCredentials: ConnectionCredentials | undefined;
    let finalConfig: ConnectionCredentials | undefined;

    if (result.data.config) {
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

      if (!existing) return notFound();

      oldCredentials = readStoredConfig(existing.configEncrypted);
      // A secret left blank keeps its stored value; everything else is
      // replaced, and only what the descriptor declares is stored (#1901).
      const checked = validateConnectionConfig(
        existing.type,
        result.data.config,
        oldCredentials,
      );
      if (!checked.success) {
        // With the stored config unreadable there was nothing to keep, so
        // say why a secret left blank is suddenly required.
        return oldCredentials
          ? checked.response
          : badRequest(
              "Stored credentials could not be decrypted. Re-enter the password and any other secret, then save again.",
            );
      }
      finalConfig = checked.config;
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

    // Whatever was known about the old host or credentials no longer holds:
    // dial again at once rather than replaying that failure for the memo's
    // whole TTL (#1888).
    forgetDeadConnector(tenantId, id);

    // Evict the old cached driver so stale credentials aren't reused
    if (oldCredentials) {
      closeConnection(connection.type, oldCredentials);
    }

    // Fire-and-forget: re-warm the schema cache after a config update. A
    // validated config is complete — its kept secrets included.
    if (finalConfig) prefetchSchema(connection.type, finalConfig);

    auditRequest(request, {
      tenantId,
      userId,
      action: "connection.update",
      resourceType: "connection",
      resourceId: id,
      // Record *that* credentials changed, never what they changed to.
      details: {
        name: connection.name,
        credentialsChanged: Boolean(finalConfig),
      },
    });

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
        name: connections.name,
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

    forgetDeadConnector(tenantId, id);

    // Evict the cached driver so the connection pool is closed. Corrupted
    // credentials leave nothing to evict.
    if (toDelete?.configEncrypted) {
      const creds = readStoredConfig(toDelete.configEncrypted);
      if (creds) closeConnection(toDelete.type, creds);
    }

    auditRequest(request, {
      tenantId,
      userId,
      action: "connection.delete",
      resourceType: "connection",
      resourceId: id,
      details: { name: toDelete?.name, forced: force },
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete connection");
  }
}
