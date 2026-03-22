import { z } from "zod";
import { and, count, countDistinct, eq, or, sql } from "drizzle-orm";
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
      // Admin sees every dashboard in the tenant — use DB-level pagination
      // to avoid loading all dashboards into memory for large deployments.
      const [{ count: total }] = await db
        .select({ count: count() })
        .from(dashboards)
        .where(eq(dashboards.tenantId, tenantId));

      const rows = await db
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
        .where(eq(dashboards.tenantId, tenantId))
        .orderBy(dashboards.updatedAt)
        .limit(limit)
        .offset(offset);

      const mapped = rows.map((d) => {
        const { layoutJson, thumbnailJson, ...rest } = d;
        return {
          ...rest,
          role: d.ownerId === userId ? ("owner" as const) : ("admin" as const),
          preview: computePreview(layoutJson, thumbnailJson),
          widgetCount: countWidgets(layoutJson),
        };
      });

      return apiList(mapped, { total: Number(total), limit, offset });
    }

    // Creator & Reader: single query with LEFT JOIN + OR for owned/shared/public.
    // DB-level deduplication via DISTINCT ON, pagination via LIMIT/OFFSET.
    const accessFilter = role === "reader"
      ? or(
          sql`${dashboardShares.id} IS NOT NULL`,
          eq(dashboards.isPublic, true),
        )
      : or(
          eq(dashboards.userId, userId),
          sql`${dashboardShares.id} IS NOT NULL`,
          eq(dashboards.isPublic, true),
        );

    const [{ count: total }] = await db
      .select({ count: countDistinct(dashboards.id) })
      .from(dashboards)
      .leftJoin(
        dashboardShares,
        and(
          eq(dashboardShares.dashboardId, dashboards.id),
          eq(dashboardShares.userId, userId),
          eq(dashboardShares.tenantId, tenantId),
        ),
      )
      .where(and(eq(dashboards.tenantId, tenantId), accessFilter));

    const rows = await db
      .selectDistinctOn([dashboards.id], {
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        ownerId: dashboards.userId,
        shareRole: dashboardShares.role,
        layoutJson: dashboards.layoutJson,
        thumbnailJson: dashboards.thumbnailJson,
        updatedByName: users.name,
      })
      .from(dashboards)
      .leftJoin(
        dashboardShares,
        and(
          eq(dashboardShares.dashboardId, dashboards.id),
          eq(dashboardShares.userId, userId),
          eq(dashboardShares.tenantId, tenantId),
        ),
      )
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .where(and(eq(dashboards.tenantId, tenantId), accessFilter))
      .orderBy(dashboards.id, dashboards.updatedAt)
      .limit(limit)
      .offset(offset);

    const mapped = rows.map((d) => {
      const { layoutJson, thumbnailJson, ownerId, shareRole, ...rest } = d;
      const dashRole = ownerId === userId
        ? ("owner" as const)
        : shareRole ?? ("viewer" as const);
      return {
        ...rest,
        role: dashRole,
        preview: computePreview(layoutJson, thumbnailJson),
        widgetCount: countWidgets(layoutJson),
      };
    });

    return apiList(mapped, { total: Number(total), limit, offset });
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
