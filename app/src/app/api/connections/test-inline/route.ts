import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { testConnection } from "@/lib/query/query-executor";
import type { DbType } from "@/lib/query/query-executor";
import { testInlineSchema } from "@/lib/shared/schemas";
import { apiSuccess } from "@/lib/api/api-response";
import {
  handleRouteError,
  validateBody,
  sanitizeErrorMessage,
} from "@/lib/api/api-utils";
import { classifyConnectionError } from "@/lib/connector/connection-error-classifier";

export async function POST(request: Request) {
  try {
    const { role } = await requireSession();
    assertCanManageConnections(role);
    const body = await request.json();
    const validation = validateBody(testInlineSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const { type, config } = validation.data;

    try {
      const success = await testConnection(type as DbType, {
        uri: config.uri,
        username: config.username,
        password: config.password,
        database: config.database,
        connectionTimeout: config.connectionTimeout,
        queryTimeout: config.queryTimeout,
        maxPoolSize: config.maxPoolSize,
        connectionAcquisitionTimeout: config.connectionAcquisitionTimeout,
        idleTimeout: config.idleTimeout,
        statementTimeout: config.statementTimeout,
        sslRejectUnauthorized: config.sslRejectUnauthorized,
      });
      return apiSuccess({
        success,
        ...(!success ? { error: "Connection check returned false" } : {}),
      });
    } catch (testError) {
      const rawMessage =
        testError instanceof Error
          ? testError.message
          : "Connection test failed";
      // Classify BEFORE sanitization — the classifier needs the raw driver
      // text to bucket reliably; the sanitizer strips that detail for display.
      const code = classifyConnectionError(rawMessage);
      const message = sanitizeErrorMessage(
        rawMessage,
        "Connection test failed",
      );
      return apiSuccess({ success: false, code, error: message });
    }
  } catch (error) {
    return handleRouteError(error, "Connection test failed");
  }
}
