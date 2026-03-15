import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { neoboardExportSchema, applyConnectionMapping } from "@/lib/dashboard-import";
import { isNeoDashFormat, convertNeoDash } from "@/lib/neodash-converter";
import type { DashboardLayoutV2 } from "@/lib/db/schema";
import { forbidden, badRequest, handleRouteError } from "@/lib/api-utils";
import { apiSuccess } from "@/lib/api-response";

const importRequestSchema = z.object({
  payload: z.unknown(),
  connectionMapping: z.record(z.string()).default({}),
});

export async function POST(request: Request) {
  try {
    const { userId, tenantId, canWrite } = await requireSession();

    if (!canWrite) {
      return forbidden();
    }

    const parsedBody = importRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return badRequest(parsedBody.error.errors[0]?.message ?? "Invalid request body");
    }
    const { payload, connectionMapping } = parsedBody.data;

    // Auto-detect and convert NeoDash format
    let exportData;
    if (isNeoDashFormat(payload)) {
      exportData = convertNeoDash(payload);
    } else {
      const parsed = neoboardExportSchema.safeParse(payload);
      if (!parsed.success) {
        return badRequest(parsed.error.errors[0].message);
      }
      exportData = parsed.data;
    }

    // Validate that all mapped connection IDs belong to the caller
    const mappedIds = [...new Set(Object.values(connectionMapping).filter(Boolean))];
    if (mappedIds.length > 0) {
      const allowed = await db
        .select({ id: connections.id })
        .from(connections)
        .where(and(inArray(connections.id, mappedIds), eq(connections.userId, userId)));
      if (allowed.length !== mappedIds.length) {
        return badRequest("Invalid connection mapping");
      }
    }

    // Apply connection mapping to layout
    const mappedLayout = applyConnectionMapping(
      exportData.layout as DashboardLayoutV2,
      connectionMapping
    );

    // Determine final name — append "(imported)" only if name already exists
    let name = exportData.dashboard.name;
    const [existing] = await db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.name, name), eq(dashboards.tenantId, tenantId)))
      .limit(1);

    if (existing) {
      name = `${name} (imported)`;
    }

    const [created] = await db
      .insert(dashboards)
      .values({
        userId,
        tenantId,
        name,
        description: exportData.dashboard.description ?? null,
        layoutJson: mappedLayout,
        isPublic: false,
        updatedBy: userId,
      })
      .returning();

    return apiSuccess(created, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
