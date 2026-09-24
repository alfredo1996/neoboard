import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { testConnection } from "@/lib/query/query-executor";
import { testInlineSchema } from "@/lib/shared/schemas";
import { validateConnectionConfig } from "@/lib/connector/connection-config";
import { apiSuccess } from "@/lib/api/api-response";
import {
  handleRouteError,
  validateBody,
  readJsonBody,
} from "@/lib/api/api-utils";
import {
  connectionCheckFalseResult,
  connectionTestErrorResult,
} from "@/lib/connector/connection-test-result";
import { isContainerised } from "@/lib/connector/is-containerised";

export async function POST(request: Request) {
  try {
    const { role } = await requireSession();
    assertCanManageConnections(role);
    const body = await readJsonBody(request);
    const validation = validateBody(testInlineSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const { type } = validation.data;
    // The same descriptor check a save runs; the connector is handed its
    // declared values and nothing else (#1901).
    const checked = validateConnectionConfig(type, validation.data.config);
    if (!checked.success) return checked.response;
    const { config } = checked;

    try {
      const success = await testConnection(type, config);
      // Shared helper builds the false/thrown result identically to the
      // [id]/test route (#1043).
      return apiSuccess(
        success ? { success: true } : connectionCheckFalseResult(),
      );
    } catch (testError) {
      return apiSuccess(
        connectionTestErrorResult(testError, {
          uri: typeof config.uri === "string" ? config.uri : undefined,
          containerised: isContainerised(),
        }),
      );
    }
  } catch (error) {
    return handleRouteError(error, "Connection test failed");
  }
}
