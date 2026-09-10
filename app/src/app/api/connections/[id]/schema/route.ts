import { requireSession } from "@/lib/auth/session";
import { getVisibleConnectionSchema } from "@/lib/connector/visible-connections";
import { apiSuccess } from "@/lib/api/api-response";
import { notFound, handleRouteError } from "@/lib/api/api-utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const found = await getVisibleConnectionSchema(session, id);
    if (!found) {
      return notFound("Connection not found");
    }

    return apiSuccess(found.schema);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch schema");
  }
}
