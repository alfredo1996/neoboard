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

/**
 * Thrown when the server responds with 503 SERVICE_UNAVAILABLE (queue full
 * or shed). Carries `retryAfterMs` from the Retry-After header so clients
 * can schedule a backoff. Used for classification in retry policies and UI.
 */
export class QueueFullError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "QueueFullError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Thrown when the server responds with 408 REQUEST_TIMEOUT (queue waiter
 * timed out). Carries `retryAfterMs` like QueueFullError.
 */
export class ClientQueueTimeoutError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "ClientQueueTimeoutError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Parse an HTTP `Retry-After` header into milliseconds.
 * Accepts either a delta-seconds integer ("2") or an HTTP-date.
 * Returns the given default if the header is missing or unparseable.
 */
export function parseRetryAfter(
  header: string | null,
  defaultMs: number,
): number {
  if (!header) return defaultMs;
  const seconds = Number.parseInt(header, 10);
  if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000;
  // HTTP-date form
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : defaultMs;
  }
  return defaultMs;
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
/**
 * If the response is a 503/408 backpressure signal, throw a typed error
 * with the parsed Retry-After hint. Otherwise return undefined to let
 * the caller continue with normal body parsing.
 *
 * Shared by `unwrapResponse` and `unwrapFullResponse` to keep their
 * backpressure handling in one place.
 */
async function throwIfBackpressure(res: Response): Promise<void> {
  if (res.status !== 503 && res.status !== 408) return;
  const retryAfterMs = parseRetryAfter(
    res.headers.get("Retry-After"),
    res.status === 503 ? 2000 : 5000,
  );
  const body = await res.json().catch(() => null);
  const msg =
    (isEnvelope(body) && body.error?.message) ||
    (res.status === 503
      ? "Server busy, try again in a moment"
      : "Server timed out, retrying…");
  throw res.status === 503
    ? new QueueFullError(msg, retryAfterMs)
    : new ClientQueueTimeoutError(msg, retryAfterMs);
}

const RAW_STATUS_HINTS: Record<number, string> = {
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

/**
 * Map a non-ok raw (non-envelope) response to a user-facing Error.
 * Prefers the body's `error` string when present, falls back to a
 * status-specific hint, then to a generic "Request failed" message.
 */
function throwRawError(res: Response, body: unknown): never {
  const rawBody = body as Record<string, unknown>;
  const msg = rawBody?.error;
  if (typeof msg === "string" && msg) {
    throw new Error(msg);
  }
  throw new Error(
    RAW_STATUS_HINTS[res.status] ?? `Request failed (HTTP ${res.status})`,
  );
}

export async function unwrapResponse<T = unknown>(res: Response): Promise<T> {
  await throwIfBackpressure(res);
  const body = await res.json();

  // Envelope format: { data, error, meta }
  if (isEnvelope(body)) {
    if (body.error) {
      throw new Error(body.error.message || body.error.code);
    }
    return body.data as T;
  }

  // Raw format (legacy): check HTTP status
  if (!res.ok) throwRawError(res, body);

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
  await throwIfBackpressure(res);
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
  if (!res.ok) throwRawError(res, body);

  return { data: body as T, meta: null };
}
