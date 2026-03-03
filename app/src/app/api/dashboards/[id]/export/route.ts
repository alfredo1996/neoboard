import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { buildExportPayload } from "@/lib/dashboard-export";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await requireSession();
    const { id } = await params;

    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .limit(1);

    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    // Load connection name + type (no credentials)
    let connectionRows: { id: string; name: string; type: string }[] = [];
    if (connectionIds.size > 0) {
      connectionRows = await db
        .select({ id: connections.id, name: connections.name, type: connections.type })
        .from(connections)
        .where(inArray(connections.id, [...connectionIds]));
    }

    const payload = buildExportPayload(dashboard, connectionRows);

    // Slugify name for filename
    const slug = dashboard.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dashboard-${slug}.json"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
