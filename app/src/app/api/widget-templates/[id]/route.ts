import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { widgetTemplates } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { apiSuccess } from "@/lib/api-response";
import { forbidden, notFound, badRequest, handleRouteError } from "@/lib/api-utils";
import { previewImageUrlSchema } from "../shared";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  chartType: z.string().min(1).optional(),
  connectorType: z.enum(["neo4j", "postgresql"]).optional(),
  connectionId: z.string().nullable().optional(),
  query: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
  previewImageUrl: previewImageUrlSchema,
});

/** Require a writable session and verify the caller owns the template (or is admin). */
async function requireOwnedTemplate(id: string) {
  const session = await requireSession();
  const { userId, role, canWrite, tenantId } = session;

  if (!canWrite) {
    return { error: forbidden() } as const;
  }

  const [existing] = await db
    .select()
    .from(widgetTemplates)
    .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return { error: notFound() } as const;
  }

  if (existing.createdBy !== userId && role !== "admin") {
    return { error: forbidden() } as const;
  }

  return { template: existing, session } as const;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await requireSession();
    const { id } = await params;

    const [template] = await db
      .select()
      .from(widgetTemplates)
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)))
      .limit(1);

    if (!template) {
      return notFound();
    }

    return apiSuccess(template);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await requireOwnedTemplate(id);
    if ("error" in result) return result.error;
    const { tenantId } = result.session;

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.errors[0].message);
    }

    const data = parsed.data;
    const settings = data.settings
      ? { ...data.settings, connectionId: undefined }
      : data.settings;

    const [updated] = await db
      .update(widgetTemplates)
      .set({ ...data, settings, updatedAt: new Date() })
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)))
      .returning();

    return apiSuccess(updated);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await requireOwnedTemplate(id);
    if ("error" in result) return result.error;
    const { tenantId } = result.session;

    await db
      .delete(widgetTemplates)
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)));

    return apiSuccess({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
