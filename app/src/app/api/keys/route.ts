import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { generateApiKey } from "@/lib/auth/api-key";
import { validateBody, handleRouteError } from "@/lib/api-utils";

const createKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  expiresAt: z.string().datetime().optional(),
});

export async function GET() {
  try {
    const { userId, tenantId } = await requireSession();

    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.tenantId, tenantId)));

    return NextResponse.json({ data: rows, error: null, meta: null });
  } catch (e) {
    return handleRouteError(e, "Failed to list API keys");
  }
}

export async function POST(request: Request) {
  try {
    const { userId, tenantId } = await requireSession();

    const body = await request.json();
    const validation = validateBody(createKeySchema, body);
    if (!validation.success) return validation.response;

    const { name, expiresAt } = validation.data;
    const { plaintext, hash } = generateApiKey();

    const [inserted] = await db
      .insert(apiKeys)
      .values({
        userId,
        tenantId,
        keyHash: hash,
        name,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      });

    return NextResponse.json(
      { data: { ...inserted, key: plaintext }, error: null, meta: null },
      { status: 201 }
    );
  } catch (e) {
    return handleRouteError(e, "Failed to create API key");
  }
}
