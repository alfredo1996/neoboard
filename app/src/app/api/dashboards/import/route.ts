import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  neoboardExportSchema,
  applyConnectionMapping,
} from "@/lib/dashboard/dashboard-import";
import {
  isNeoDashFormat,
  convertNeoDashWithNotes,
} from "@/lib/dashboard/neodash-converter";
import type { DashboardLayoutV2 } from "@/lib/db/schema";
import { forbidden, badRequest, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { formatImportError } from "@/lib/dashboard/format-import-error";

const importRequestSchema = z.object({
  payload: z.unknown(),
  connectionMapping: z.record(z.string()).default({}),
  // Connection keys the user explicitly chose to skip. Widgets referencing
  // a skipped key will have connectionId="" and a note is added so the user
  // knows what they need to fix manually.
  skippedConnections: z.array(z.string()).default([]),
});

// Synthesized placeholder used for NeoDash imports. NeoDash dashboards always
// pointed at one global Neo4j; we surface that as a single required mapping.
const NEODASH_PLACEHOLDER_KEY = "neodash-default";

function pluralWidgets(count: number): string {
  return count === 1 ? "1 widget" : count + " widgets";
}

export async function POST(request: Request) {
  try {
    const { userId, tenantId, canWrite } = await requireSession();

    if (!canWrite) {
      return forbidden();
    }

    const parsedBody = importRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return badRequest(
        parsedBody.error.errors[0]?.message ?? "Invalid request body",
      );
    }
    const { payload, connectionMapping, skippedConnections } = parsedBody.data;

    const importNotes: string[] = [];
    const skipSet = new Set(skippedConnections);

    // Detect format + convert to NeoBoard envelope
    let exportData;
    let isNeoDash = false;
    if (isNeoDashFormat(payload)) {
      isNeoDash = true;
      const placeholderTarget = connectionMapping[NEODASH_PLACEHOLDER_KEY];
      const isSkipped = skipSet.has(NEODASH_PLACEHOLDER_KEY);
      const defaultConnectionId =
        placeholderTarget && !isSkipped ? placeholderTarget : "";
      const conv = convertNeoDashWithNotes(payload, defaultConnectionId);
      exportData = conv.export;
      importNotes.push(...conv.notes);
      if (isSkipped) {
        importNotes.push(
          "Connection was skipped — all widgets imported without a connection. " +
            "Assign one in the widget editor before they will load data.",
        );
      }
    } else {
      const parsed = neoboardExportSchema.safeParse(payload);
      if (!parsed.success) {
        // Name the offending field instead of a bare "Required" (#1048).
        return badRequest(formatImportError(parsed.error));
      }
      exportData = parsed.data;
    }

    // Validate mapping targets belong to the caller's tenant + user.
    // Skipped-key mappings are ignored.
    const mappedIds = [
      ...new Set(
        Object.entries(connectionMapping)
          .filter(([key, value]) => !!value && !skipSet.has(key))
          .map(([, value]) => value),
      ),
    ];
    if (mappedIds.length > 0) {
      const allowed = await db
        .select({ id: connections.id })
        .from(connections)
        .where(
          and(
            inArray(connections.id, mappedIds),
            eq(connections.userId, userId),
            eq(connections.tenantId, tenantId),
          ),
        );
      if (allowed.length !== mappedIds.length) {
        return badRequest("Invalid connection mapping");
      }
    }

    // Apply mapping. For NeoDash, widgets already carry the resolved
    // connectionId from the converter (via defaultConnectionId). For NeoBoard,
    // the mapping rewrites widget connectionId from source-key → target id;
    // skipped keys result in connectionId="".
    const effectiveMapping: Record<string, string> = {};
    for (const [key, target] of Object.entries(connectionMapping)) {
      if (skipSet.has(key)) {
        effectiveMapping[key] = "";
      } else if (target) {
        effectiveMapping[key] = target;
      }
    }
    for (const key of skipSet) {
      if (!(key in effectiveMapping)) {
        effectiveMapping[key] = "";
      }
    }

    const mappedLayout = isNeoDash
      ? (exportData.layout as DashboardLayoutV2)
      : applyConnectionMapping(
          exportData.layout as DashboardLayoutV2,
          effectiveMapping,
        );

    // Count widgets without a connection so the user knows what to fix.
    const unmappedWidgetCount = mappedLayout.pages.reduce(
      (sum, page) =>
        sum +
        page.widgets.filter((w) => !w.connectionId || w.connectionId === "")
          .length,
      0,
    );
    if (!isNeoDash && unmappedWidgetCount > 0) {
      importNotes.push(
        pluralWidgets(unmappedWidgetCount) +
          " imported without a connection — assign one in the widget editor before they will load data.",
      );
    }

    // Append "(imported)" only if the name already exists in this tenant.
    let name = exportData.dashboard.name;
    const [existing] = await db
      .select({ id: dashboards.id })
      .from(dashboards)
      .where(and(eq(dashboards.name, name), eq(dashboards.tenantId, tenantId)))
      .limit(1);
    if (existing) {
      name = name + " (imported)";
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

    return apiSuccess({ ...created, notes: importNotes }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
