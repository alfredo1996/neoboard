import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, tenantId, role: userRole, canWrite } = await requireSession();
    const { id } = await params;

    if (!canWrite) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify the caller can view the source dashboard (tenant-scoped)
    const [source] = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Non-admin Creators can only duplicate dashboards they own or are assigned to
    if (userRole !== "admin") {
      const isOwner = source.userId === userId;
      if (!isOwner) {
        const [share] = await db
          .select({ id: dashboardShares.id })
          .from(dashboardShares)
          .where(
            and(
              eq(dashboardShares.dashboardId, id),
              eq(dashboardShares.userId, userId),
              eq(dashboardShares.tenantId, tenantId)
            )
          )
          .limit(1);

        if (!share) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
      }
    }

    const [copy] = await db
      .insert(dashboards)
      .values({
        userId,
        tenantId,
        name: `${source.name} (copy)`,
        description: source.description,
        layoutJson: source.layoutJson,
        isPublic: false,
        updatedBy: userId,
      })
      .returning();

    return NextResponse.json(copy, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
