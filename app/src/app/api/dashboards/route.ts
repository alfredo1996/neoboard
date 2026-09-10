import { z } from "zod";
import { db } from "@/lib/db";
import { dashboards } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { validateBody, forbidden, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess, apiList, parsePagination } from "@/lib/api/api-response";
import { auditRequest } from "@/lib/audit/audit";
import { listDashboards } from "@/lib/dashboard/list-dashboards";

const createDashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { limit, offset } = parsePagination(request);
    const { items, total } = await listDashboards(session, { limit, offset });
    return apiList(items, { total, limit, offset });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch dashboards");
  }
}

export async function POST(request: Request) {
  try {
    const { userId, canWrite, tenantId } = await requireSession();

    if (!canWrite) {
      return forbidden();
    }

    const body = await request.json();
    const result = validateBody(createDashboardSchema, body);
    if (!result.success) return result.response;

    const [dashboard] = await db
      .insert(dashboards)
      .values({
        userId,
        tenantId,
        name: result.data.name,
        description: result.data.description,
        updatedBy: userId,
      })
      .returning();

    auditRequest(request, {
      tenantId,
      userId,
      action: "dashboard.create",
      resourceType: "dashboard",
      resourceId: dashboard.id,
      details: { name: dashboard.name },
    });

    return apiSuccess(dashboard, 201);
  } catch (error) {
    return handleRouteError(error, "Failed to create dashboard");
  }
}
