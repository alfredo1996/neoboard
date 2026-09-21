import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto/crypto";
import { testConnection } from "@/lib/query/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query/query-executor";
import { apiSuccess } from "@/lib/api/api-response";
import { notFound, handleRouteError } from "@/lib/api/api-utils";
import {
  connectionCheckFalseResult,
  connectionTestErrorResult,
} from "@/lib/connector/connection-test-result";
import { isContainerised } from "@/lib/connector/is-containerised";
import { forgetDeadConnector } from "@/lib/query/middleware/dead-connector";
import { withSchedulerSlot } from "@/lib/query/middleware/scheduler";
import { QueueRejectedError, QueueTimeoutError } from "@/lib/query/scheduler";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId } = await requireSession();
    const { id } = await params;
    // A probe opens a real connection, so it takes a slot from the same
    // per-connection scheduler as a query (#1426). One Test is interactive
    // (P1); "Test all" marks its probes P2, the tier of a dashboard load — one
    // action fanning out — so they queue behind anyone working on that
    // connection. Never P3: that tier is shed under load, and a shed probe
    // tells the user who asked for it nothing.
    const priority = request.headers.get("x-query-priority") === "2" ? 2 : 1;

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
      const success = await withSchedulerSlot(
        { connectionId: id, userId, priority },
        () => testConnection(connection.type as DbType, credentials),
      );
      // A false result (no throw) gets an actionable fallback; a thrown error
      // is classified for a targeted hint. Both via the shared helper (#1043).
      // A pass also lets queries dial again at once, not after the memo's
      // TTL (#1888).
      if (success) forgetDeadConnector(tenantId, id);
      return apiSuccess(
        success ? { success: true } : connectionCheckFalseResult(),
      );
    } catch (testError) {
      // Backpressure is not a verdict on the connection: the probe never
      // reached it. Let handleRouteError answer 503 / 408 as it does for a
      // query, so the page can say "busy, try again" instead of "failed".
      if (
        testError instanceof QueueRejectedError ||
        testError instanceof QueueTimeoutError
      ) {
        throw testError;
      }
      return apiSuccess(
        connectionTestErrorResult(testError, {
          uri:
            typeof credentials.uri === "string" ? credentials.uri : undefined,
          containerised: isContainerised(),
        }),
      );
    }
  } catch (error) {
    return handleRouteError(error, "Connection test failed");
  }
}
