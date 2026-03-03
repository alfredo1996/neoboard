import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { widgetTemplates } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
});

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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(widgetTemplates)
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.createdBy !== userId && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(widgetTemplates)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(widgetTemplates)
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.createdBy !== userId && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db
      .delete(widgetTemplates)
      .where(and(eq(widgetTemplates.id, id), eq(widgetTemplates.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
