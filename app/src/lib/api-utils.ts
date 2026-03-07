import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

/**
 * Shared API route utilities to reduce duplication across route handlers.
 */

// ---------------------------------------------------------------------------
// Error response helpers
// ---------------------------------------------------------------------------

export function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export function forbidden(msg = "Forbidden") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function serverError(msg = "Internal server error") {
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

export function validateBody<T>(
  schema: ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Generic catch handler
// ---------------------------------------------------------------------------

export function handleRouteError(
  error: unknown,
  fallbackMsg = "Internal server error",
): NextResponse {
  const message = error instanceof Error ? error.message : fallbackMsg;
  if (message.includes("Unauthorized") || message.includes("session")) {
    return unauthorized();
  }
  if (message === "Forbidden") {
    return forbidden();
  }
  return serverError(message);
}
