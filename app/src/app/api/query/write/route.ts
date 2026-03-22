import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { executeQuery } from "@/lib/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query-executor";
import { validateBody, forbidden, notFound, serverError } from "@/lib/api-utils";
import { apiSuccess } from "@/lib/api-response";

const writeQuerySchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const { userId, canWrite, tenantId } = await requireSession();

    if (!canWrite) {
      return forbidden("Write permission required");
    }

    const body = await request.json();
    const validation = validateBody(writeQuerySchema, body);
    if (!validation.success) return validation.response;

    const { connectionId, query, params } = validation.data;

    // Only connection owners can execute write queries (tenant-scoped)
    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.userId, userId), eq(connections.tenantId, tenantId)))
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    const queryStart = performance.now();
    const result = await executeQuery(
      connection.type as DbType,
      credentials,
      { query, params },
      { accessMode: "WRITE" },
    );
    const serverDurationMs = Math.round(performance.now() - queryStart);

    return apiSuccess(result.data, 200, { serverDurationMs });
  } catch (error) {
    console.error("[write-query]", error instanceof Error ? error.message : error);
    return serverError("Write query execution failed");
  }
}
