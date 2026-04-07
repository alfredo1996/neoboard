import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { generateApiKey } from "@/lib/auth/api-key";
import { validateBody, forbidden, handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

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

    return apiSuccess(rows);
  } catch (e) {
    return handleRouteError(e, "Failed to list API keys");
  }
}

export async function POST(request: Request) {
  try {
    const { userId, tenantId, canWrite, role } = await requireSession();
    if (!canWrite) {
      return forbidden();
    }

    const body = await request.json();
    const validation = validateBody(createKeySchema, body);
    if (!validation.success) return validation.response;

    const { name, expiresAt } = validation.data;

    let plaintext: string;
    let hash: string;
    try {
      ({ plaintext, hash } = generateApiKey());
    } catch {
      // generateApiKey throws when API_KEY_HMAC_SECRET is missing
      const msg =
        role === "admin"
          ? "API_KEY_HMAC_SECRET is not configured. Set it in your environment variables."
          : "API key service is not available. Contact your administrator.";
      return Response.json(
        {
          data: null,
          error: { code: "SERVICE_UNAVAILABLE", message: msg },
          meta: null,
        },
        { status: 503 },
      );
    }

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

    return apiSuccess({ ...inserted, key: plaintext }, 201);
  } catch (e) {
    return handleRouteError(e, "Failed to create API key");
  }
}
