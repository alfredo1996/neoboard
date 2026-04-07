import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { encryptJson, decryptJson } from "@/lib/crypto/crypto";
import { prefetchSchema } from "@/lib/connector/schema-prefetch";
import { updateConnectionSchema } from "@/lib/shared/schemas";
import type { ConnectorType } from "@/lib/connector/connector-types";
import {
  validateBody,
  notFound,
  handleRouteError,
  badRequest,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId, role } = await requireSession();
    const { id } = await params;

    // Owner check first (tenant-scoped)
    let [connection] = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        configEncrypted: connections.configEncrypted,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
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
        })
        .from(connections)
        .where(and(eq(connections.id, id), eq(connections.tenantId, tenantId)))
        .limit(1);
    }

    if (!connection) {
      return notFound("Connection not found");
    }

    // Decrypt config and strip password before returning
    const { configEncrypted, ...metadata } = connection;
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

    return apiSuccess({ ...metadata, config });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch connection");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId } = await requireSession();
    const { id } = await params;
    const body = await request.json();
    const result = validateBody(updateConnectionSchema, body);
    if (!result.success) return result.response;

    const updates: Record<string, unknown> = {};
    if (result.data.name) updates.name = result.data.name;

    let finalConfig = result.data.config;
    if (finalConfig && !finalConfig.password) {
      // Password omitted — merge with existing encrypted config
      const [existing] = await db
        .select({ configEncrypted: connections.configEncrypted })
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
          const prev = decryptJson<Record<string, unknown>>(
            existing.configEncrypted,
          );
          finalConfig = { ...finalConfig, password: prev.password as string };
        } catch {
          // Stored config is corrupted/unreadable — user must re-enter password
          return badRequest(
            "Stored credentials could not be decrypted. Please re-enter the password.",
          );
        }
      }
    }

    if (finalConfig) updates.configEncrypted = encryptJson(finalConfig);

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
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId } = await requireSession();
    const { id } = await params;

    const deleted = await db
      .delete(connections)
      .where(
        and(
          eq(connections.id, id),
          eq(connections.userId, userId),
          eq(connections.tenantId, tenantId),
        ),
      )
      .returning({ id: connections.id });

    if (deleted.length === 0) {
      return notFound();
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete connection");
  }
}
