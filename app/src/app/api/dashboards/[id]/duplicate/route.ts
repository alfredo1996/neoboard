import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { forbidden, notFound, handleRouteError } from "@/lib/api-utils";
import { apiSuccess } from "@/lib/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role: userRole, canWrite, tenantId } = await requireSession();
    const { id } = await params;

    if (!canWrite || userRole === "reader") {
      return forbidden();
    }

    // Verify the caller can view the source dashboard (scoped to tenant)
    const [source] = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .limit(1);

    if (!source) {
      return notFound();
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
          return notFound();
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
      })
      .returning();

    return apiSuccess(copy, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
