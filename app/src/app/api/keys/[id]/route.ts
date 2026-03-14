import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { handleRouteError, notFound } from "@/lib/api-utils";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, tenantId } = await requireSession();
    const { id } = await params;

    const deleted = await db
      .delete(apiKeys)
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.userId, userId),
          eq(apiKeys.tenantId, tenantId)
        )
      )
      .returning({ id: apiKeys.id });

    if (deleted.length === 0) {
      return notFound("API key not found");
    }

    return NextResponse.json({ data: { success: true }, error: null, meta: null });
  } catch (e) {
    return handleRouteError(e, "Failed to revoke API key");
  }
}
