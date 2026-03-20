import { requireSession } from "@/lib/auth/session";
import { testConnection } from "@/lib/query-executor";
import type { DbType } from "@/lib/query-executor";
import { testInlineSchema } from "@/lib/schemas";
import { apiSuccess } from "@/lib/api-response";
import { handleRouteError, validateBody } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    await requireSession();
    const body = await request.json();
    const validation = validateBody(testInlineSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const { type, config } = validation.data;
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

    return apiSuccess({ success });
  } catch (error) {
    return handleRouteError(error, "Connection test failed");
  }
}
