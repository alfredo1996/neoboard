import type { ZodSchema } from "zod";
import { apiError } from "./api-response";

/**
 * Shared API route utilities to reduce duplication across route handlers.
 * All error responses use the standardized envelope format.
 */

// ---------------------------------------------------------------------------
// Error response helpers
// ---------------------------------------------------------------------------

export function unauthorized(msg = "Unauthorized") {
  return apiError("UNAUTHORIZED", msg);
}

export function forbidden(msg = "Forbidden") {
  return apiError("FORBIDDEN", msg);
}

export function notFound(msg = "Not found") {
  return apiError("NOT_FOUND", msg);
}

export function badRequest(msg: string) {
  return apiError("BAD_REQUEST", msg);
}

export function serverError(msg = "Internal server error") {
  return apiError("INTERNAL_ERROR", msg);
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

export function validateBody<T>(
  schema: ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; response: ReturnType<typeof apiError> } {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      response: apiError("VALIDATION_ERROR", parsed.error.errors[0].message),
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
): ReturnType<typeof apiError> {
  const message = error instanceof Error ? error.message : fallbackMsg;
  if (message.includes("Unauthorized") || message.includes("session")) {
    return unauthorized();
  }
  if (message === "Forbidden") {
    return forbidden();
  }
  return serverError(message);
}
