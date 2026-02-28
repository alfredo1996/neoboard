import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import type { DashboardLayoutV2 } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

interface WidgetPreviewItem {
  x: number;
  y: number;
  w: number;
  h: number;
  chartType: string;
}

function computePreview(
  layout: DashboardLayoutV2 | null | undefined
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

export async function GET() {
  try {
    const { userId, role, tenantId } = await requireSession();

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
        })
        .from(dashboards)
        .where(eq(dashboards.tenantId, tenantId));

      return NextResponse.json(
        all.map((d) => {
          const { layoutJson, ...rest } = d;
          return {
            ...rest,
            role: d.ownerId === userId ? ("owner" as const) : ("admin" as const),
            preview: computePreview(layoutJson),
            widgetCount: countWidgets(layoutJson),
          };
        })
      );
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
      })
      .from(dashboards)
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
      })
      .from(dashboardShares)
      .innerJoin(dashboards, eq(dashboardShares.dashboardId, dashboards.id))
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
      })
      .from(dashboards)
      .where(and(eq(dashboards.tenantId, tenantId), eq(dashboards.isPublic, true)));

    function addPreview<T extends { layoutJson: DashboardLayoutV2 | null }>(
      d: T
    ) {
      const { layoutJson, ...rest } = d;
      return {
        ...rest,
        preview: computePreview(layoutJson),
        widgetCount: countWidgets(layoutJson),
      };
    }

    // Build combined list: owned + shared + public, deduplicated by ID
    const ownedMapped = owned.map((d) => addPreview({ ...d, role: "owner" as const }));
    const sharedMapped = shared.map(addPreview);
    const publicMapped = publicDashboards.map((d) => addPreview({ ...d, role: "viewer" as const }));

    // For Readers: shared + public (not owned, since Readers cannot create dashboards).
    // For Creators: owned + shared + public.
    const combined =
      role === "reader"
        ? [...sharedMapped, ...publicMapped]
        : [...ownedMapped, ...sharedMapped, ...publicMapped];

    // Deduplicate by ID (first occurrence wins — preserves owner/editor role over viewer)
    const seen = new Set<string>();
    const result = combined.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, canWrite, tenantId } = await requireSession();

    if (!canWrite) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createDashboardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const [dashboard] = await db
      .insert(dashboards)
      .values({
        userId,
        tenantId,
        name: parsed.data.name,
        description: parsed.data.description,
      })
      .returning();

    return NextResponse.json(dashboard, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
