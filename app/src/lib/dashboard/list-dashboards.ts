import { and, count, countDistinct, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares, users } from "@/lib/db/schema";
import type { DashboardLayoutV2, UserRole } from "@/lib/db/schema";

function countWidgets(layout: DashboardLayoutV2 | null | undefined): number {
  if (!layout?.pages) return 0;
  return layout.pages.reduce((sum, page) => sum + page.widgets.length, 0);
}

/**
 * One page of the dashboards a session can open, with the caller's role on
 * each. Shared by GET /api/dashboards and the MCP `list_dashboards` tool, so
 * both answer with the same access rules.
 *
 * Admin: every dashboard in the tenant. Creator: owned, shared and public.
 * Reader: shared and public.
 */
export async function listDashboards(
  session: { userId: string; role: UserRole; tenantId: string },
  page: { limit: number; offset: number },
) {
  const { userId, role, tenantId } = session;
  const { limit, offset } = page;

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
        updatedByName: users.name,
      })
      .from(dashboards)
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .where(eq(dashboards.tenantId, tenantId))
      .orderBy(dashboards.updatedAt)
      .limit(limit)
      .offset(offset);

    const items = rows.map((d) => {
      const { layoutJson, ownerId, ...rest } = d;
      return {
        ...rest,
        role: ownerId === userId ? ("owner" as const) : ("admin" as const),
        widgetCount: countWidgets(layoutJson),
      };
    });

    return { items, total: Number(total) };
  }

  // Creator & Reader: single query with LEFT JOIN + OR for owned/shared/public.
  // DB-level deduplication via DISTINCT ON, pagination via LIMIT/OFFSET.
  const accessFilter =
    role === "reader"
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

  const items = rows.map((d) => {
    const { layoutJson, ownerId, shareRole, ...rest } = d;
    const dashRole =
      ownerId === userId
        ? ("owner" as const)
        : (shareRole ?? ("viewer" as const));
    return {
      ...rest,
      role: dashRole,
      widgetCount: countWidgets(layoutJson),
    };
  });

  return { items, total: Number(total) };
}
