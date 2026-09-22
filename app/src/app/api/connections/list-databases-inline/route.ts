import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { listDatabases, listSchemas } from "@/lib/query/query-executor";
import { testInlineSchema } from "@/lib/shared/schemas";
import { validateConnectionConfig } from "@/lib/connector/connection-config";
import { apiSuccess } from "@/lib/api/api-response";
import { handleRouteError, validateBody } from "@/lib/api/api-utils";

export async function POST(request: Request) {
  try {
    const { role } = await requireSession();
    assertCanManageConnections(role);
    const body = await request.json();
    const validation = validateBody(testInlineSchema, body);

    if (!validation.success) {
      return validation.response;
    }

    const { type } = validation.data;
    // The same descriptor check a save runs (#1901).
    const checked = validateConnectionConfig(type, validation.data.config);
    if (!checked.success) return checked.response;
    const { config } = checked;

    const databases = await listDatabases(type, config).catch(
      () => [] as string[],
    );

    // Schemas come from whichever connectors have them (#1902). `listSchemas`
    // already answers [] for a module that does not implement it, so asking
    // every connector is both simpler and right for one nobody hardcoded —
    // the `type === "postgresql"` gate this replaces gave a third connector
    // none, however well it implemented the method.
    const schemas = await listSchemas(type, config).catch(() => [] as string[]);

    return apiSuccess({
      databases,
      schemas,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to list databases");
  }
}
