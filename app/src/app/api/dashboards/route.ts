import { z } from "zod";
import { and, count, countDistinct, desc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { dashboards, dashboardShares, users } from "@/lib/db/schema";
import type { DashboardLayoutV2 } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import {
  validateBody,
  forbidden,
  handleRouteError,
  readJsonBody,
} from "@/lib/api/api-utils";
import { apiSuccess, apiList, parsePagination } from "@/lib/api/api-response";
import { auditRequest } from "@/lib/audit/audit";

function countWidgets(layout: DashboardLayoutV2 | null | undefined): number {
  if (!layout?.pages) return 0;
  return layout.pages.reduce((sum, page) => sum + page.widgets.length, 0);
}

/** Most recently updated first; `id` breaks ties so the order is deterministic (#1789). */
const NEWEST_FIRST = [desc(dashboards.updatedAt), desc(dashboards.id)];

const createDashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// The owner's display name, by a second join to users; the name only (#2253).
const owners = alias(users, "owners");
const ownerJoin = (tenantId: string) =>
  and(eq(owners.id, dashboards.userId), eq(owners.tenantId, tenantId));

// The caller's own share of a dashboard, if any: the same ON on every path.
const shareJoin = (userId: string, tenantId: string) =>
  and(
    eq(dashboardShares.dashboardId, dashboards.id),
    eq(dashboardShares.userId, userId),
    eq(dashboardShares.tenantId, tenantId),
  );

// People the dashboard is shared with: distinct share rows' users, owner
// excluded, in the caller's tenant. The public flag is not a person and is
// not counted. A subquery, so the list stays one query (#2223).
const shareCount = (tenantId: string) =>
  sql<number>`(select count(distinct ${dashboardShares.userId}) from ${dashboardShares} where ${dashboardShares.dashboardId} = ${dashboards.id} and ${dashboardShares.tenantId} = ${tenantId} and ${dashboardShares.userId} <> ${dashboards.userId})`.mapWith(
    Number,
  );

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

      // DISTINCT ON (updatedAt, id), as the non-admin path below: nothing keeps
      // a share unique per (dashboard, user), and a second row would repeat a
      // dashboard while `total` still says N (#1789).
      const rows = await db
        .selectDistinctOn([dashboards.updatedAt, dashboards.id], {
          id: dashboards.id,
          name: dashboards.name,
          description: dashboards.description,
          isPublic: dashboards.isPublic,
          createdAt: dashboards.createdAt,
          updatedAt: dashboards.updatedAt,
          ownerId: dashboards.userId,
          layoutJson: dashboards.layoutJson,
          updatedByName: users.name,
          ownerName: owners.name,
          shareId: dashboardShares.id,
          shareCount: shareCount(tenantId),
        })
        .from(dashboards)
        .leftJoin(users, eq(dashboards.updatedBy, users.id))
        .leftJoin(owners, ownerJoin(tenantId))
        .leftJoin(dashboardShares, shareJoin(userId, tenantId))
        .where(eq(dashboards.tenantId, tenantId))
        .orderBy(...NEWEST_FIRST)
        .limit(limit)
        .offset(offset);

      const mapped = rows.map((d) => {
        const { layoutJson, ownerId, shareId, ...rest } = d;
        return {
          ...rest,
          shared: shareId != null,
          role: ownerId === userId ? ("owner" as const) : ("admin" as const),
          widgetCount: countWidgets(layoutJson),
          pageCount: layoutJson?.pages?.length ?? 0,
        };
      });

      return apiList(mapped, { total: Number(total), limit, offset });
    }

    // Creator & Reader: single query with LEFT JOIN + OR for owned/shared/public.
    // DB-level deduplication via DISTINCT ON, pagination via LIMIT/OFFSET.
    // Postgres requires DISTINCT ON to match the leading ORDER BY columns;
    // (updatedAt, id) is as distinct as id alone because id is unique.
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
      .selectDistinctOn([dashboards.updatedAt, dashboards.id], {
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
        ownerName: owners.name,
        shareId: dashboardShares.id,
        shareCount: shareCount(tenantId),
      })
      .from(dashboards)
      .leftJoin(dashboardShares, shareJoin(userId, tenantId))
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .leftJoin(owners, ownerJoin(tenantId))
      .where(and(eq(dashboards.tenantId, tenantId), accessFilter))
      .orderBy(...NEWEST_FIRST)
      .limit(limit)
      .offset(offset);

    const mapped = rows.map((d) => {
      const { layoutJson, ownerId, shareRole, shareId, ...rest } = d;
      const dashRole =
        ownerId === userId
          ? ("owner" as const)
          : (shareRole ?? ("viewer" as const));
      return {
        ...rest,
        // Whether a share row names the caller. The role cannot say: a public
        // dashboard nobody shared reads `viewer` too (#2253).
        shared: shareId != null,
        role: dashRole,
        widgetCount: countWidgets(layoutJson),
        pageCount: layoutJson?.pages?.length ?? 0,
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

    const body = await readJsonBody(request);
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

    auditRequest(request, {
      tenantId,
      userId,
      action: "dashboard.create",
      resourceType: "dashboard",
      resourceId: dashboard.id,
      details: { name: dashboard.name },
    });

    return apiSuccess(dashboard, 201);
  } catch (error) {
    return handleRouteError(error, "Failed to create dashboard");
  }
}
