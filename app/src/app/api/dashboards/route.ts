import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";

const createDashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();

    // Get owned dashboards
    const owned = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        role: dashboards.userId, // placeholder, mapped below
      })
      .from(dashboards)
      .where(eq(dashboards.userId, userId));

    // Get shared dashboards
    const shared = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
        role: dashboardShares.role,
      })
      .from(dashboardShares)
      .innerJoin(dashboards, eq(dashboardShares.dashboardId, dashboards.id))
      .where(eq(dashboardShares.userId, userId));

    const result = [
      ...owned.map((d) => ({ ...d, role: "owner" as const })),
      ...shared,
    ];

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
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
        name: parsed.data.name,
        description: parsed.data.description,
      })
      .returning();

    return NextResponse.json(dashboard, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
