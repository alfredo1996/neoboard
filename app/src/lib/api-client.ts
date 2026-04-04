/**
 * Frontend API client utilities.
 *
 * Provides `unwrapResponse` to handle both old (raw) and new (envelope)
 * response formats during the incremental migration to the standardized
 * `{ data, error, meta }` envelope.
 */

/** Shape of the standardized API error envelope. */
interface ApiEnvelopeError {
  code: string;
  message?: string;
}

/** Shape of the standardized API response envelope. */
interface ApiEnvelope<T = unknown> {
  data: T;
  error: ApiEnvelopeError | null;
  meta: unknown;
}

/** Type guard: is the parsed body an envelope response? */
function isEnvelope(body: unknown): body is ApiEnvelope {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    "data" in body &&
    "error" in body &&
    "meta" in body
  );
}

/**
 * Unwrap a fetch Response, handling both envelope and raw formats.
 *
 * - Envelope success → returns `data`
 * - Envelope error → throws with `error.message`
 * - Raw success → returns parsed JSON as-is
 * - Raw error (non-ok) → throws with `error` field or generic message
 */
export async function unwrapResponse<T = unknown>(res: Response): Promise<T> {
  const body = await res.json();

  // Envelope format: { data, error, meta }
  if (isEnvelope(body)) {
    if (body.error) {
      throw new Error(body.error.message || body.error.code);
    }
    return body.data as T;
  }

  // Raw format (legacy): check HTTP status
  if (!res.ok) {
    const rawBody = body as Record<string, unknown>;
    const msg = rawBody?.error;
    if (typeof msg === "string" && msg) {
      throw new Error(msg);
    }
    // Provide a more descriptive fallback based on HTTP status
    const statusHints: Record<number, string> = {
      400: "Bad request — check query syntax",
      401: "Unauthorized — please log in again",
      403: "Forbidden — insufficient permissions",
      404: "Not found — the resource may have been deleted",
      408: "Request timed out — try a simpler query",
      500: "Internal server error — check server logs",
      502: "Bad gateway — the database may be unreachable",
      503: "Service unavailable — try again later",
      504: "Gateway timeout — the query took too long",
    };
    throw new Error(
      statusHints[res.status] ?? `Request failed (HTTP ${res.status})`,
    );
  }

  return body as T;
}

/**
 * Like `unwrapResponse` but also returns `meta`.
 * Use this when the caller needs server-side metadata (e.g. resultId,
 * serverDurationMs, pagination info) in addition to the data payload.
 */
export async function unwrapFullResponse<T = unknown>(
  res: Response,
): Promise<{ data: T; meta: Record<string, unknown> | null }> {
  const body = await res.json();

  if (isEnvelope(body)) {
    if (body.error) {
      throw new Error(body.error.message || body.error.code);
    }
    return {
      data: body.data as T,
      meta: body.meta as Record<string, unknown> | null,
    };
  }

  // Raw format: return body as data, no meta
  if (!res.ok) {
    const rawBody = body as Record<string, unknown>;
    const msg = rawBody?.error;
    if (typeof msg === "string" && msg) {
      throw new Error(msg);
    }
    const statusHints: Record<number, string> = {
      400: "Bad request — check query syntax",
      401: "Unauthorized — please log in again",
      403: "Forbidden — insufficient permissions",
      404: "Not found — the resource may have been deleted",
      408: "Request timed out — try a simpler query",
      500: "Internal server error — check server logs",
      502: "Bad gateway — the database may be unreachable",
      503: "Service unavailable — try again later",
      504: "Gateway timeout — the query took too long",
    };
    throw new Error(
      statusHints[res.status] ?? `Request failed (HTTP ${res.status})`,
    );
  }

  return { data: body as T, meta: null };
}
