import { z } from "zod";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { widgetTemplates } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { apiSuccess, apiList, parsePagination } from "@/lib/api/api-response";
import { forbidden, badRequest, handleRouteError } from "@/lib/api/api-utils";
import { previewImageUrlSchema } from "./shared";
import { connectorTypeSchema } from "@/lib/shared/schemas";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  chartType: z.string().min(1),
  // Absent when the widget needs no connection at all (#1900).
  connectorType: connectorTypeSchema.optional(),
  connectionId: z.string().optional(),
  query: z.string().default(""),
  params: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  previewImageUrl: previewImageUrlSchema,
});

export async function GET(request: Request) {
  try {
    const { tenantId } = await requireSession();
    const url = new URL(request.url);
    const chartType = url.searchParams.get("chartType");
    const connectorType = url.searchParams.get("connectorType");
    const { limit, offset } = parsePagination(request);

    const conditions = [eq(widgetTemplates.tenantId, tenantId)];
    if (chartType) {
      conditions.push(eq(widgetTemplates.chartType, chartType));
    }
    if (connectorType) {
      // A template whose widget needs no connection has no connectorType, and
      // belongs on every connection (#1900) — an equality alone would hide
      // exactly those, which is what the old hardcoded default masked.
      const matchesOrNeedsNone = or(
        eq(widgetTemplates.connectorType, connectorType),
        isNull(widgetTemplates.connectorType),
      );
      if (matchesOrNeedsNone) conditions.push(matchesOrNeedsNone);
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(widgetTemplates)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(widgetTemplates)
      .where(and(...conditions))
      .orderBy(asc(widgetTemplates.createdAt), asc(widgetTemplates.id))
      .limit(limit)
      .offset(offset);

    return apiList(rows, { total, limit, offset });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, canWrite, tenantId } = await requireSession();

    if (!canWrite) {
      return forbidden();
    }

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return badRequest(parsed.error.issues[0].message);
    }

    const data = parsed.data;
    // Strip connectionId from settings (it's now a top-level column)
    const settings = data.settings
      ? { ...data.settings, connectionId: undefined }
      : data.settings;

    const [template] = await db
      .insert(widgetTemplates)
      .values({
        ...data,
        settings,
        createdBy: userId,
        tenantId,
      })
      .returning();

    return apiSuccess(template, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
