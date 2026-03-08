import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { widgetTemplates } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

/** Max size for preview image data URIs (500 KB). */
const MAX_PREVIEW_SIZE = 500 * 1024;

const previewImageUrlSchema = z
  .string()
  .refine((s) => s.startsWith("data:image/"), "Must be a data:image/ URI")
  .refine((s) => s.length <= MAX_PREVIEW_SIZE, `Preview image must be under ${MAX_PREVIEW_SIZE / 1024}KB`)
  .optional();

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  chartType: z.string().min(1),
  connectorType: z.enum(["neo4j", "postgresql"]),
  query: z.string().default(""),
  params: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
  previewImageUrl: previewImageUrlSchema,
});

export async function GET(request: Request) {
  try {
    const { tenantId } = await requireSession();
    const url = new URL(request.url);
    const chartType = url.searchParams.get("chartType");
    const connectorType = url.searchParams.get("connectorType");

    const conditions = [eq(widgetTemplates.tenantId, tenantId)];
    if (chartType) {
      conditions.push(eq(widgetTemplates.chartType, chartType));
    }
    if (connectorType) {
      conditions.push(eq(widgetTemplates.connectorType, connectorType));
    }

    const rows = await db
      .select()
      .from(widgetTemplates)
      .where(and(...conditions))
      .orderBy(widgetTemplates.createdAt);

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, canWrite, tenantId } = await requireSession();

    if (!canWrite) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = parsed.data;
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

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
