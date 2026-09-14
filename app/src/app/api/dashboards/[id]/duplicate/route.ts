import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { resolveDashboardAccess } from "@/lib/dashboard/access";
import { requireSession } from "@/lib/auth/session";
import { forbidden, notFound, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import {
  layoutConnectionIds,
  unusableConnectionIds,
} from "@/lib/db/connection-access";

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

    // The copy is the caller's own dashboard, and an owner may run any read
    // query on the connections a dashboard names (#972). So every connection
    // in the source must be one the caller can already use (#1816).
    const unusable = await unusableConnectionIds(
      layoutConnectionIds(source.layoutJson),
      { userId, tenantId, role: userRole },
    );
    if (unusable.length > 0) {
      return forbidden(
        "This dashboard uses a connection you don't have access to, so it can't be duplicated",
      );
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

    return apiSuccess(copy, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
