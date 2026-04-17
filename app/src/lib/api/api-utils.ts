import type { ZodSchema } from "zod";
import { apiError } from "./api-response";
import { EnterpriseRequiredError } from "@/lib/features/require-feature";
import { QueueRejectedError, QueueTimeoutError } from "@/lib/query/scheduler";
import { apiLogger } from "@/lib/logger";

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
// Error message sanitization
// ---------------------------------------------------------------------------

/**
 * Strip bundler/runtime internals from user-facing error messages.
 * Turbopack/webpack can produce errors like:
 *   `(0 , __TURBOPACK__imported__module__$5b$project$5d...) is not a function`
 * These are meaningless to users and should be replaced with a clean
 * fallback. Also collapses stack-trace noise.
 */
export function sanitizeErrorMessage(
  msg: string,
  fallback = "Internal server error — check server logs",
): string {
  // Detect bundler internal paths or mangled module IDs
  if (
    msg.includes("__TURBOPACK__") ||
    msg.includes("__webpack_require__") ||
    msg.includes("__webpack__") ||
    /\$[0-9a-f]{2}\$/.test(msg) // e.g. $5b$ encoded chars
  ) {
    return fallback;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

export function validateBody<T>(
  schema: ZodSchema<T>,
  data: unknown,
):
  | { success: true; data: T }
  | { success: false; response: ReturnType<typeof apiError> } {
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
  if (error instanceof EnterpriseRequiredError) {
    return apiError("ENTERPRISE_REQUIRED", error.message);
  }
  if (error instanceof QueueRejectedError) {
    // 503 with Retry-After so clients can back off without hard-failing
    // the user. Header is set below after the response is constructed.
    return apiError("SERVICE_UNAVAILABLE", error.message, {
      reason: error.reason,
    });
  }
  if (error instanceof QueueTimeoutError) {
    return apiError("REQUEST_TIMEOUT", error.message);
  }
  const message = error instanceof Error ? error.message : fallbackMsg;
  if (message.includes("Unauthorized") || message.includes("session")) {
    return unauthorized();
  }
  if (message === "Forbidden") {
    return forbidden();
  }
  apiLogger.error(
    {
      event: "api_error",
      err: error instanceof Error ? error : String(error),
    },
    "api_error",
  );
  return serverError(fallbackMsg);
}
