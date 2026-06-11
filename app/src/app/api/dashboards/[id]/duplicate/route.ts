import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { resolveDashboardAccess } from "@/lib/dashboard/access";
import { requireSession } from "@/lib/auth/session";
import { forbidden, notFound, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const {
      userId,
      role: userRole,
      canWrite,
      tenantId,
    } = await requireSession();
    const { id } = await params;

    if (!canWrite || userRole === "reader") {
      return forbidden();
    }

    // Duplicating is for dashboards the caller owns or is shared on — NOT
    // anything merely public (allowPublic: false), preserving prior
    // behavior via the shared ACL helper (#979).
    const access = await resolveDashboardAccess({
      dashboardId: id,
      userId,
      tenantId,
      userRole,
      required: "viewer",
      allowPublic: false,
    });

    if (!access) {
      return notFound();
    }
    const source = access.dashboard;

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

    return apiSuccess(copy, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
