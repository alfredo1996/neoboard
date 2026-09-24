import type { ZodSchema } from "zod";
import { apiError } from "./api-response";
import { EnterpriseRequiredError } from "@/lib/features/require-feature";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { QueueRejectedError, QueueTimeoutError } from "@/lib/query/scheduler";
import {
  classificationOf,
  connectorUnavailableReason,
} from "@/lib/connector/connection-error-classifier";
import type { ConnectorErrorClassification } from "@neoboard/connection";
import { apiLogger } from "@/lib/logger";
import { redactString } from "@/lib/log-redact";
import { headers } from "next/headers";

/**
 * Read the per-request correlation id that proxy.ts stamps on every request
 * (`x-request-id`). Returns undefined outside a request context (e.g. unit
 * tests calling handleRouteError directly), so error logging never throws.
 */
async function currentRequestId(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}

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
 *
 * Then strips credentials, using the same patterns as the logger rather than
 * a second copy of them. This path is a response, not a log — but it carries
 * the same raw driver messages, and a reader can trigger a query against a
 * connection whose URI they have no right to see (#1227).
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
  return redactString(msg);
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

/** A request body that is not JSON (#1963): the caller's mistake, answered 400. */
export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Request body is not valid JSON");
  }
}

/**
 * The request's JSON body. A body that does not parse (empty included) throws
 * InvalidJsonBodyError, which handleRouteError answers 400 — a bare
 * `request.json()` threw a SyntaxError that answered 500 as a server fault.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}

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
      response: apiError("VALIDATION_ERROR", parsed.error.issues[0].message),
    };
  }
  return { success: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// Generic catch handler
// ---------------------------------------------------------------------------

/**
 * The verdict of the connector that raised the error, as a response (#1903).
 * `undefined` when neither category applies, so the caller falls through to
 * its generic handling.
 *
 * Unavailable is decided BEFORE transient, and must stay that way: a connect
 * timeout is, by its wording, also transient, so every widget on a dead
 * connection used to get 408 + Retry-After and retry three times, each attempt
 * waiting the full connect timeout, and the dashboard never settled (#1678).
 * 502 carries no Retry-After — the client only auto-retries 503/408 — so this
 * is one request per widget per refresh cycle, and `reason` lets the UI show
 * the matching hint.
 */
function connectorResponse(
  error: unknown,
  classification: ConnectorErrorClassification | undefined,
  fallbackMsg: string,
  safeMessage: boolean,
): ReturnType<typeof apiError> | undefined {
  // A connector nobody can reach — unroutable host, refused port, bad
  // credentials.
  const unavailable = connectorUnavailableReason(error);
  if (unavailable) {
    return apiError(
      "CONNECTOR_UNAVAILABLE",
      safeMessage
        ? fallbackMsg
        : sanitizeErrorMessage((error as Error).message, fallbackMsg),
      { reason: unavailable },
    );
  }
  // Transient failures — a query timeout, a dropped connection, a busy pool.
  // These look like 500s but a quick retry usually succeeds, so respond with
  // 408 + Retry-After so the client can transparently retry before showing
  // the user an error. Which errors those are is the connector's call;
  // permanent ones (a bad statement, a missing table) hit the regular 500.
  if (classification?.transient) {
    const raw = error instanceof Error ? error.message : fallbackMsg;
    return apiError(
      "REQUEST_TIMEOUT",
      safeMessage ? fallbackMsg : sanitizeErrorMessage(raw, fallbackMsg),
      undefined,
      { "Retry-After": "3" },
    );
  }
  return undefined;
}

export async function handleRouteError(
  error: unknown,
  fallbackMsg = "Internal server error",
  options?: {
    /**
     * When true, untyped errors (e.g. raw driver/query errors) collapse to
     * `fallbackMsg` instead of being passed through `sanitizeErrorMessage`.
     * Use this on routes where the underlying error message could leak schema
     * details, query structure, or other sensitive shape — most notably the
     * write-query route, where a syntax error echoes the user's statement.
     */
    safeMessage?: boolean;
  },
): Promise<ReturnType<typeof apiError>> {
  // Our own auth errors, by type (#1962). They used to be recognised by
  // their words, so a driver error that said "session" answered 401 and told
  // a signed-in user to sign in again.
  if (error instanceof UnauthorizedError) return unauthorized();
  if (error instanceof ForbiddenError) return forbidden();
  if (error instanceof InvalidJsonBodyError) {
    return apiError("VALIDATION_ERROR", error.message);
  }
  if (error instanceof EnterpriseRequiredError) {
    return apiError("ENTERPRISE_REQUIRED", error.message);
  }
  if (error instanceof QueueRejectedError) {
    // 503 with Retry-After so clients can back off without hard-failing
    // the user. The header value (in seconds) is a hint — clients should
    // use this as a minimum, then apply jitter/backoff.
    return apiError(
      "SERVICE_UNAVAILABLE",
      error.message,
      { reason: error.reason },
      { "Retry-After": "2" },
    );
  }
  if (error instanceof QueueTimeoutError) {
    // 408 with Retry-After so auto-refreshers know when to try again.
    return apiError("REQUEST_TIMEOUT", error.message, undefined, {
      "Retry-After": "5",
    });
  }
  // What the connector that raised this says it is (#1903). Undefined for an
  // error no connector raised: the app recognises no driver's words itself.
  const classification = classificationOf(error);
  const classified = connectorResponse(
    error,
    classification,
    fallbackMsg,
    options?.safeMessage === true,
  );
  if (classified) return classified;
  const message = error instanceof Error ? error.message : fallbackMsg;
  apiLogger.error(
    {
      event: "api_error",
      // Correlation id (proxy.ts stamps x-request-id) so an error log can be
      // tied back to the same request's other logs — every route through this
      // handler is now traceable, not just the two using logRoute (#1220).
      requestId: await currentRequestId(),
      // `err` key triggers pino.stdSerializers → message + stack + code
      err: error instanceof Error ? error : String(error),
      errorCode:
        error instanceof Error
          ? ((error as Error & { code?: string }).code ?? error.name)
          : "UNKNOWN",
    },
    "api_error",
  );
  // Return a sanitized error message to the client. Raw driver/DB errors
  // can leak query structure and schema details, so sanitizeErrorMessage
  // strips bundler internals while preserving meaningful messages.
  // Routes that opt into `safeMessage` collapse to the fallback unconditionally
  // — used by the write route to keep a driver's syntax errors, which echo the
  // statement, out of responses.
  if (options?.safeMessage) {
    return serverError(fallbackMsg);
  }
  return apiError(
    "INTERNAL_ERROR",
    sanitizeErrorMessage(message, fallbackMsg),
    // A write that read-only execution stopped: the preview says so in plain
    // words instead of showing the driver's (#1043).
    classification?.blockedWrite ? { blockedWrite: true } : undefined,
  );
}
