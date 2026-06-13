import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto/crypto";
import { testConnection } from "@/lib/query/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query/query-executor";
import { apiSuccess } from "@/lib/api/api-response";
import {
  notFound,
  handleRouteError,
  sanitizeErrorMessage,
} from "@/lib/api/api-utils";

export async function POST(
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

    // Decrypt failures are an expected operational state (rotated/lost
    // ENCRYPTION_KEY, or seeding with a mismatched key) — surface them as an
    // actionable test result, not an unhandled 500 (#1040). Recovery path:
    // re-entering credentials in the edit dialog re-encrypts with the
    // current key.
    let credentials: ConnectionCredentials;
    try {
      credentials = decryptJson<ConnectionCredentials>(
        connection.configEncrypted,
      );
    } catch {
      return apiSuccess({
        success: false,
        code: "decrypt_failed",
        error:
          "Stored credentials can't be decrypted (encryption key changed?). Edit the connection and re-enter its credentials.",
      });
    }

    try {
      const success = await testConnection(
        connection.type as DbType,
        credentials,
      );
      return apiSuccess({
        success,
        ...(!success ? { error: "Connection check returned false" } : {}),
      });
    } catch (testError) {
      const rawMessage =
        testError instanceof Error
          ? testError.message
          : "Connection test failed";
      const message = sanitizeErrorMessage(
        rawMessage,
        "Connection test failed",
      );
      return apiSuccess({ success: false, error: message });
    }
  } catch (error) {
    return handleRouteError(error, "Connection test failed");
  }
}
