import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

const createDashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET() {
  try {
    const { userId, role } = await requireSession();

    if (role === "admin") {
      // Admin sees every dashboard
      const all = await db
        .select({
          id: dashboards.id,
          name: dashboards.name,
          description: dashboards.description,
          isPublic: dashboards.isPublic,
          createdAt: dashboards.createdAt,
          updatedAt: dashboards.updatedAt,
          ownerId: dashboards.userId,
        })
        .from(dashboards);

      return NextResponse.json(
        all.map((d) => ({
          ...d,
          role: d.ownerId === userId ? ("owner" as const) : ("admin" as const),
        }))
      );
    }

    // Creator & Reader: owned dashboards + explicitly assigned/shared
    const owned = await db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        description: dashboards.description,
        isPublic: dashboards.isPublic,
        createdAt: dashboards.createdAt,
        updatedAt: dashboards.updatedAt,
      })
      .from(dashboards)
      .where(eq(dashboards.userId, userId));

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

    // For Readers: only show explicitly assigned dashboards (not owned, since
    // Readers cannot create dashboards). For Creators: show owned + shared.
    const result =
      role === "reader"
        ? shared
        : [
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
    const { userId } = await requireSession();
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
