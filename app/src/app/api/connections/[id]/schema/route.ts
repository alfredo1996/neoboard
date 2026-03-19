import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { fetchConnectionSchema } from "@/lib/schema-prefetch";
import type { ConnectionCredentials } from "@/lib/query-executor";
import { apiSuccess } from "@/lib/api-response";
import { notFound, handleRouteError } from "@/lib/api-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id } = await params;

    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    const schema = await fetchConnectionSchema(
      connection.type as "neo4j" | "postgresql",
      credentials,
    );

    return apiSuccess(schema);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch schema");
  }
}
