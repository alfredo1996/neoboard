import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { testConnection } from "@/lib/query/query-executor";
import type { DbType } from "@/lib/query/query-executor";
import { testInlineSchema } from "@/lib/shared/schemas";
import { apiSuccess } from "@/lib/api/api-response";
import { handleRouteError, validateBody } from "@/lib/api/api-utils";
import {
  connectionCheckFalseResult,
  connectionTestErrorResult,
} from "@/lib/connector/connection-test-result";

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
      // Shared helper builds the false/thrown result identically to the
      // [id]/test route (#1043).
      return apiSuccess(
        success ? { success: true } : connectionCheckFalseResult(),
      );
    } catch (testError) {
      return apiSuccess(connectionTestErrorResult(testError));
    }
  } catch (error) {
    return handleRouteError(error, "Connection test failed");
  }
}
