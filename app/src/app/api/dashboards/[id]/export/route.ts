import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { buildExportPayload } from "@/lib/dashboard-export";
import { notFound, handleRouteError } from "@/lib/api-utils";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, tenantId, role } = await requireSession();
    const { id } = await params;

    // Fetch the dashboard with tenant scoping
    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .limit(1);

    if (!dashboard) {
      return notFound("Dashboard not found");
    }

    // Access control: admin can export any dashboard in the tenant;
    // owners and shared users (viewer or editor) can export;
    // public dashboards are exportable by any tenant user.
    if (role !== "admin" && dashboard.userId !== userId) {
      const [share] = await db
        .select({ id: dashboardShares.id })
        .from(dashboardShares)
        .where(
          and(
            eq(dashboardShares.dashboardId, id),
            eq(dashboardShares.userId, userId),
            eq(dashboardShares.tenantId, tenantId),
          )
        )
        .limit(1);

      if (!share && !dashboard.isPublic) {
        return notFound("Dashboard not found");
      }
    }

    const layout = dashboard.layoutJson as DashboardLayoutV2 | null;

    // Gather unique non-empty connectionIds from all pages
    const connectionIds = new Set<string>();
    if (layout?.pages) {
      for (const page of layout.pages) {
        for (const widget of page.widgets) {
          if (widget.connectionId) {
            connectionIds.add(widget.connectionId);
          }
        }
      }
    }

    // Load connection name + type (no credentials).
    // Include connections owned by the user OR referenced by dashboards
    // they have access to (admin sees all in tenant context).
    let connectionRows: { id: string; name: string; type: string }[] = [];
    if (connectionIds.size > 0) {
      connectionRows = await db
        .select({ id: connections.id, name: connections.name, type: connections.type })
        .from(connections)
        .where(
          and(
            inArray(connections.id, [...connectionIds]),
            eq(connections.tenantId, tenantId),
            role === "admin" ? undefined : eq(connections.userId, userId),
          )
        );
    }

    const payload = buildExportPayload(dashboard, connectionRows);

    // Slugify name for filename
    const slug = dashboard.name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "");

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dashboard-${slug}.json"`,
      },
    });
  } catch (error) {
    return handleRouteError(error, "Failed to export dashboard");
  }
}
