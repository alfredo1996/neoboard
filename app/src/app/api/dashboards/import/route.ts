import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { neoboardExportSchema, applyConnectionMapping } from "@/lib/dashboard-import";
import { isNeoDashFormat, convertNeoDash } from "@/lib/neodash-converter";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const { userId, tenantId, canWrite } = await requireSession();

    if (!canWrite) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { payload, connectionMapping = {} } = body as {
      payload: unknown;
      connectionMapping: Record<string, string>;
    };

    // Auto-detect and convert NeoDash format
    let exportData;
    if (isNeoDashFormat(payload)) {
      exportData = convertNeoDash(payload);
    } else {
      const parsed = neoboardExportSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.errors[0].message },
          { status: 400 }
        );
      }
      exportData = parsed.data;
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
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
