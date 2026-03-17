import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares, users } from "@/lib/db/schema";
import type { DashboardLayoutV2 } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { validateBody, forbidden, handleRouteError } from "@/lib/api-utils";
import { apiSuccess, apiList, parsePagination } from "@/lib/api-response";

interface WidgetPreviewItem {
  x: number;
  y: number;
  w: number;
  h: number;
  chartType: string;
  thumbnailUrl?: string;
}

function computePreview(
  layout: DashboardLayoutV2 | null | undefined,
  thumbnails?: Record<string, string> | null,
): WidgetPreviewItem[] {
  if (!layout?.pages?.[0]) return [];
  const page = layout.pages[0];
  const typeMap = new Map(page.widgets.map((w) => [w.id, w.chartType]));
  return page.gridLayout.map((g) => ({
    x: g.x,
    y: g.y,
    w: g.w,
    h: g.h,
    chartType: typeMap.get(g.i) ?? "unknown",
    ...(thumbnails?.[g.i] ? { thumbnailUrl: thumbnails[g.i] } : {}),
  }));
}

function countWidgets(layout: DashboardLayoutV2 | null | undefined): number {
  if (!layout?.pages) return 0;
  return layout.pages.reduce((sum, page) => sum + page.widgets.length, 0);
}

const createDashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { limit, offset } = parsePagination(request);

    if (role === "admin") {
      // Admin sees every dashboard in the tenant
      const all = await db
        .select({
          id: dashboards.id,
          name: dashboards.name,
          description: dashboards.description,
          isPublic: dashboards.isPublic,
          createdAt: dashboards.createdAt,
          updatedAt: dashboards.updatedAt,
          ownerId: dashboards.userId,
          layoutJson: dashboards.layoutJson,
          thumbnailJson: dashboards.thumbnailJson,
          updatedByName: users.name,
        })
        .from(dashboards)
        .leftJoin(users, eq(dashboards.updatedBy, users.id))
        .where(eq(dashboards.tenantId, tenantId));

      const mapped = all.map((d) => {
        const { layoutJson, thumbnailJson, ...rest } = d;
        return {
          ...rest,
          role: d.ownerId === userId ? ("owner" as const) : ("admin" as const),
          preview: computePreview(layoutJson, thumbnailJson),
          widgetCount: countWidgets(layoutJson),
        };
      });

      const total = mapped.length;
      const paginated = mapped.slice(offset, offset + limit);
      return apiList(paginated, { total, limit, offset });
    }

    // Creator & Reader: owned dashboards + explicitly assigned/shared + public
    const owned = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        layoutJson: dashboards.layoutJson,
        thumbnailJson: dashboards.thumbnailJson,
        updatedByName: users.name,
      })
      .from(dashboards)
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .where(and(eq(dashboards.userId, userId), eq(dashboards.tenantId, tenantId)));

    const shared = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        role: dashboardShares.role,
        layoutJson: dashboards.layoutJson,
        thumbnailJson: dashboards.thumbnailJson,
        updatedByName: users.name,
      })
      .from(dashboardShares)
      .innerJoin(dashboards, eq(dashboardShares.dashboardId, dashboards.id))
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .where(
        and(
          eq(dashboardShares.userId, userId),
          eq(dashboards.tenantId, tenantId)
        )
      );

    const publicDashboards = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        layoutJson: dashboards.layoutJson,
        thumbnailJson: dashboards.thumbnailJson,
        updatedByName: users.name,
      })
      .from(dashboards)
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .where(and(eq(dashboards.tenantId, tenantId), eq(dashboards.isPublic, true)));

    function addPreview<T extends { layoutJson: DashboardLayoutV2 | null; thumbnailJson: Record<string, string> | null }>(
      d: T
    ) {
      const { layoutJson, thumbnailJson, ...rest } = d;
      return {
        ...rest,
        preview: computePreview(layoutJson, thumbnailJson),
        widgetCount: countWidgets(layoutJson),
      };
    }

    // Build combined list: owned + shared + public, deduplicated by ID
    const ownedMapped = owned.map((d) => addPreview({ ...d, role: "owner" as const }));
    const sharedMapped = shared.map(addPreview);
    const publicMapped = publicDashboards.map((d) => addPreview({ ...d, role: "viewer" as const }));

    const combined =
      role === "reader"
        ? [...sharedMapped, ...publicMapped]
        : [...ownedMapped, ...sharedMapped, ...publicMapped];

    // Deduplicate by ID (first occurrence wins — preserves owner/editor role over viewer)
    const seen = new Set<string>();
    const deduped = combined.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    const total = deduped.length;
    const paginated = deduped.slice(offset, offset + limit);
    return apiList(paginated, { total, limit, offset });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch dashboards");
  }
}

export async function POST(request: Request) {
  try {
    const { userId, canWrite, tenantId } = await requireSession();

    if (!canWrite) {
      return forbidden();
    }

    const body = await request.json();
    const result = validateBody(createDashboardSchema, body);
    if (!result.success) return result.response;

    const [dashboard] = await db
      .insert(dashboards)
      .values({
        userId,
        tenantId,
        name: result.data.name,
        description: result.data.description,
        updatedBy: userId,
      })
      .returning();

    return apiSuccess(dashboard, 201);
  } catch (error) {
    return handleRouteError(error, "Failed to create dashboard");
  }
}
