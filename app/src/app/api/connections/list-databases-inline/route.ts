import { requireSession } from "@/lib/auth/session";
import { listDatabases, listSchemas } from "@/lib/query/query-executor";
import type { DbType } from "@/lib/query/query-executor";
import { testInlineSchema } from "@/lib/shared/schemas";
import { apiSuccess } from "@/lib/api/api-response";
import { handleRouteError, validateBody } from "@/lib/api/api-utils";

export async function POST(request: Request) {
  try {
    await requireSession();
    const body = await request.json();
    const validation = validateBody(testInlineSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const { type, config } = validation.data;

    const credentials = {
      uri: config.uri,
      username: config.username,
      password: config.password,
      database: config.database,
      sslRejectUnauthorized: config.sslRejectUnauthorized,
      connectionTimeout: config.connectionTimeout,
      queryTimeout: config.queryTimeout,
      maxPoolSize: config.maxPoolSize,
      statementTimeout: config.statementTimeout,
    };

    const databases = await listDatabases(type as DbType, credentials).catch(
      () => [] as string[],
    );

    // For PostgreSQL, also fetch schemas
    let schemas: string[] | undefined;
    if (type === "postgresql") {
      schemas = await listSchemas(type as DbType, credentials).catch(
        () => [] as string[],
      );
    }

    return apiSuccess({
      databases,
      ...(schemas !== undefined ? { schemas } : {}),
    });
  } catch (error) {
    return handleRouteError(error, "Failed to list databases");
  }
}
