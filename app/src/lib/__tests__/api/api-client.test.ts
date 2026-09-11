import { describe, it, expect } from "vitest";
import {
  unwrapResponse,
  unwrapFullResponse,
  QueueFullError,
  ClientQueueTimeoutError,
  ConnectorUnavailableError,
  parseRetryAfter,
} from "@/lib/api/api-client";

/** Helper to build a fake Response with a JSON body. */
function fakeResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => headerMap.get(k) ?? null,
    },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("unwrapResponse", () => {
  // ---------------------------------------------------------------------------
  // Envelope responses — success
  // ---------------------------------------------------------------------------

  it("extracts data from a success envelope", async () => {
    const res = fakeResponse({
      data: { id: "1", name: "Test" },
      error: null,
      meta: null,
    });
    const result = await unwrapResponse<{ id: string; name: string }>(res);
    expect(result).toEqual({ id: "1", name: "Test" });
  });

  it("extracts array data from a list envelope", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    const res = fakeResponse({
      data: items,
      error: null,
      meta: { total: 2, limit: 25, offset: 0 },
    });
    const result = await unwrapResponse<{ id: string }[]>(res);
    expect(result).toEqual(items);
  });

  it("returns null data as null", async () => {
    const res = fakeResponse({ data: null, error: null, meta: null });
    const result = await unwrapResponse(res);
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Envelope responses — errors
  // ---------------------------------------------------------------------------

  it("throws on error envelope with message", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "NOT_FOUND", message: "Dashboard not found" },
        meta: null,
      },
      404,
    );
    await expect(unwrapResponse(res)).rejects.toThrow("Dashboard not found");
  });

  it("throws on error envelope with code when no message", async () => {
    const res = fakeResponse(
      { data: null, error: { code: "INTERNAL_ERROR" }, meta: null },
      500,
    );
    await expect(unwrapResponse(res)).rejects.toThrow("INTERNAL_ERROR");
  });

  // ---------------------------------------------------------------------------
  // Raw (non-envelope) responses — backwards compatibility
  // ---------------------------------------------------------------------------

  it("passes through a raw array response", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    const res = fakeResponse(items);
    const result = await unwrapResponse<{ id: string }[]>(res);
    expect(result).toEqual(items);
  });

  it("passes through a raw object response", async () => {
    const body = { success: true, resultId: "abc123" };
    const res = fakeResponse(body);
    const result = await unwrapResponse(res);
    expect(result).toEqual(body);
  });

  it("throws on non-ok raw response", async () => {
    const res = fakeResponse({ error: "Something went wrong" }, 500);
    await expect(unwrapResponse(res)).rejects.toThrow("Something went wrong");
  });

  it("throws descriptive message on non-ok response with no error field", async () => {
    const res = fakeResponse({}, 500);
    await expect(unwrapResponse(res)).rejects.toThrow(
      "Internal server error — check server logs",
    );
  });

  it("throws descriptive message for 504 timeout", async () => {
    const res = fakeResponse({}, 504);
    await expect(unwrapResponse(res)).rejects.toThrow(
      "Gateway timeout — the query took too long",
    );
  });

  it("throws fallback message for unknown status code", async () => {
    const res = fakeResponse({}, 418);
    await expect(unwrapResponse(res)).rejects.toThrow(
      "Request failed (HTTP 418)",
    );
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("handles raw response with error string on 4xx", async () => {
    const res = fakeResponse({ error: "Unauthorized" }, 401);
    await expect(unwrapResponse(res)).rejects.toThrow("Unauthorized");
  });

  // ---------------------------------------------------------------------------
  // Backpressure responses (503 / 408) — typed errors with Retry-After
  // ---------------------------------------------------------------------------

  it("throws QueueFullError on 503 with parsed Retry-After", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "SERVICE_UNAVAILABLE", message: "Queue full" },
        meta: null,
      },
      503,
      { "Retry-After": "3" },
    );
    await expect(unwrapResponse(res)).rejects.toMatchObject({
      name: "QueueFullError",
      retryAfterMs: 3000,
      message: "Queue full",
    });
  });

  it("throws QueueFullError with default delay when Retry-After missing", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "SERVICE_UNAVAILABLE", message: "Busy" },
        meta: null,
      },
      503,
    );
    await expect(unwrapResponse(res)).rejects.toMatchObject({
      name: "QueueFullError",
      retryAfterMs: 2000,
    });
  });

  it("throws ClientQueueTimeoutError on 408 with parsed Retry-After", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "REQUEST_TIMEOUT", message: "Queue timeout" },
        meta: null,
      },
      408,
      { "Retry-After": "7" },
    );
    await expect(unwrapResponse(res)).rejects.toMatchObject({
      name: "ClientQueueTimeoutError",
      retryAfterMs: 7000,
      message: "Queue timeout",
    });
  });

  it("falls back to generic message when 503 body is unparseable", async () => {
    const res = {
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response;
    await expect(unwrapResponse(res)).rejects.toBeInstanceOf(QueueFullError);
  });
});

describe("unwrapFullResponse", () => {
  it("returns data and meta on envelope success", async () => {
    const res = fakeResponse({
      data: { id: "1" },
      error: null,
      meta: { total: 10 },
    });
    const result = await unwrapFullResponse<{ id: string }>(res);
    expect(result.data).toEqual({ id: "1" });
    expect(result.meta).toEqual({ total: 10 });
  });

  it("throws on envelope error", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "BAD_REQUEST", message: "nope" },
        meta: null,
      },
      400,
    );
    await expect(unwrapFullResponse(res)).rejects.toThrow("nope");
  });

  it("throws QueueFullError on 503 with Retry-After", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "SERVICE_UNAVAILABLE", message: "Queue full" },
        meta: null,
      },
      503,
      { "Retry-After": "4" },
    );
    await expect(unwrapFullResponse(res)).rejects.toMatchObject({
      name: "QueueFullError",
      retryAfterMs: 4000,
    });
  });

  it("throws ClientQueueTimeoutError on 408", async () => {
    const res = fakeResponse(
      {
        data: null,
        error: { code: "REQUEST_TIMEOUT", message: "Timeout" },
        meta: null,
      },
      408,
    );
    await expect(unwrapFullResponse(res)).rejects.toBeInstanceOf(
      ClientQueueTimeoutError,
    );
  });

  it("falls back to raw format when body is not an envelope", async () => {
    const res = fakeResponse([1, 2, 3]);
    const result = await unwrapFullResponse(res);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.meta).toBeNull();
  });

  it("throws descriptive message on non-ok raw response", async () => {
    const res = fakeResponse({ something: "bad" }, 500);
    await expect(unwrapFullResponse(res)).rejects.toThrow(
      /Internal server error/,
    );
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds integer", () => {
    expect(parseRetryAfter("5", 1000)).toBe(5000);
  });

  it("returns default when header is null", () => {
    expect(parseRetryAfter(null, 1500)).toBe(1500);
  });

  it("returns default when header is unparseable", () => {
    expect(parseRetryAfter("not-a-number", 2000)).toBe(2000);
  });

  it("parses HTTP-date and returns positive delta", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const result = parseRetryAfter(future, 0);
    expect(result).toBeGreaterThan(8000);
    expect(result).toBeLessThan(12_000);
  });

  it("returns default for past HTTP-date", () => {
    const past = new Date(Date.now() - 10_000).toUTCString();
    expect(parseRetryAfter(past, 3000)).toBe(3000);
  });

  it("returns 0ms for '0' seconds", () => {
    expect(parseRetryAfter("0", 1000)).toBe(0);
  });
});

describe("error classes", () => {
  it("QueueFullError exposes retryAfterMs and correct name", () => {
    const err = new QueueFullError("busy", 1500);
    expect(err.name).toBe("QueueFullError");
    expect(err.message).toBe("busy");
    expect(err.retryAfterMs).toBe(1500);
    expect(err).toBeInstanceOf(Error);
  });

  it("ClientQueueTimeoutError exposes retryAfterMs and correct name", () => {
    const err = new ClientQueueTimeoutError("timeout", 4000);
    expect(err.name).toBe("ClientQueueTimeoutError");
    expect(err.retryAfterMs).toBe(4000);
    expect(err).toBeInstanceOf(Error);
  });

  it("ConnectorUnavailableError exposes the classifier reason", () => {
    const err = new ConnectorUnavailableError("dead", "auth_failed");
    expect(err.name).toBe("ConnectorUnavailableError");
    expect(err.reason).toBe("auth_failed");
    expect(err).toBeInstanceOf(Error);
  });
});

/**
 * #1678 — the 502 the route returns for a dead connector must arrive as a
 * typed error, so the retry predicate can refuse it and the widget can name
 * the connector instead of printing the raw driver text.
 */
describe("CONNECTOR_UNAVAILABLE envelope (#1678)", () => {
  const envelope = (reason?: string) => ({
    data: null,
    error: {
      code: "CONNECTOR_UNAVAILABLE",
      message: "timeout exceeded when trying to connect",
      ...(reason ? { details: { reason } } : {}),
    },
    meta: null,
  });

  it.each([
    ["unwrapResponse", unwrapResponse],
    ["unwrapFullResponse", unwrapFullResponse],
  ] as const)("%s throws ConnectorUnavailableError", async (_n, unwrap) => {
    const p = unwrap(fakeResponse(envelope("network"), 502));
    await expect(p).rejects.toBeInstanceOf(ConnectorUnavailableError);
    await expect(p).rejects.toMatchObject({
      reason: "network",
      message: "timeout exceeded when trying to connect",
    });
  });

  it("carries auth_failed through", async () => {
    await expect(
      unwrapResponse(fakeResponse(envelope("auth_failed"), 502)),
    ).rejects.toMatchObject({ reason: "auth_failed" });
  });

  it("defaults the reason to network when details are missing", async () => {
    await expect(
      unwrapResponse(fakeResponse(envelope(), 502)),
    ).rejects.toMatchObject({ reason: "network" });
  });

  it("is not a backpressure error — no retryAfterMs", async () => {
    const err = await unwrapResponse(
      fakeResponse(envelope("network"), 502),
    ).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(QueueFullError);
    expect(err).not.toBeInstanceOf(ClientQueueTimeoutError);
  });

  it("leaves other envelope errors as plain Error", async () => {
    const err = await unwrapResponse(
      fakeResponse(
        {
          data: null,
          error: { code: "INTERNAL_ERROR", message: "syntax error" },
          meta: null,
        },
        500,
      ),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ConnectorUnavailableError);
  });
});

/**
 * #1409 — a 4xx write error carries the offending column in `details`; the
 * form needs it on the thrown error to put the message on the right field.
 */
describe("envelope error details (#1409)", () => {
  const envelope = {
    data: null,
    error: {
      code: "VALIDATION_ERROR",
      message: 'The field "category" is required.',
      details: { column: "category" },
    },
    meta: null,
  };

  it.each([
    ["unwrapResponse", unwrapResponse],
    ["unwrapFullResponse", unwrapFullResponse],
  ] as const)("%s keeps the error details", async (_n, unwrap) => {
    await expect(unwrap(fakeResponse(envelope, 400))).rejects.toMatchObject({
      message: 'The field "category" is required.',
      details: { column: "category" },
    });
  });
});
