import { apiLogger } from "@/lib/logger";

/**
 * Route handler wrapper that emits structured request lifecycle logs.
 *
 * Route handlers opt in by wrapping their body:
 *
 *   export async function POST(request: Request) {
 *     return logRoute(request, "query", async () => {
 *       // existing handler body — unchanged
 *     });
 *   }
 *
 * Emits:
 * - `request_start` at debug level (visible only when LOG_LEVEL=debug) so
 *   high-traffic routes don't spam info-level logs.
 * - `request_end` at info level on every completed request (including 4xx
 *   and 5xx responses returned normally by the handler). Carries method,
 *   path, status, durationMs, and requestId.
 * - `request_error` at error level only when an exception escapes the
 *   handler (i.e. the handler did not catch it). Operators should treat
 *   these as "something unexpected crashed a route". Carries the same
 *   context plus the error message (and stack in non-production builds).
 *
 * requestId is read from the `x-request-id` header that proxy.ts stamps
 * on every incoming request. Downstream audit logs from slice 1 already
 * include the same id, so a single request can be reconstructed end-to-end.
 */
export async function logRoute<T extends Response>(
  request: Request,
  module: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  const requestId = request.headers.get("x-request-id") ?? undefined;
  const method = request.method;
  const path = extractPath(request.url);
  const log = apiLogger.child({ module });

  log.debug(
    { event: "request_start", method, path, requestId },
    "request_start",
  );

  try {
    const response = await fn();
    const durationMs = Math.round(performance.now() - start);
    log.info(
      {
        event: "request_end",
        method,
        path,
        status: response.status,
        durationMs,
        requestId,
      },
      "request_end",
    );
    return response;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const isProd = process.env.NODE_ENV === "production";
    log.error(
      {
        event: "request_error",
        method,
        path,
        durationMs,
        requestId,
        err:
          err instanceof Error
            ? {
                message: err.message,
                ...(isProd ? {} : { stack: err.stack }),
              }
            : String(err),
      },
      "request_error",
    );
    throw err;
  }
}

/**
 * Extract the pathname from a request URL. Tolerant of relative URLs
 * (which shouldn't happen in production but do appear in test mocks).
 */
function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // Fallback for test mocks that pass relative paths or no URL at all.
    return url || "/";
  }
}
