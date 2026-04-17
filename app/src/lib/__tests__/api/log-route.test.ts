import { describe, it, expect, vi, beforeEach } from "vitest";
import { logRoute } from "@/lib/api/log-route";

type LogRecord = {
  level: string;
  obj: Record<string, unknown>;
  msg: string;
};

// Spy on the apiLogger. The mock exposes a `child()` method that returns
// the same spy, which matches pino.child() semantics — child loggers inherit
// the parent's methods and bindings.
const logged: LogRecord[] = [];

vi.mock("@/lib/logger", () => {
  const make = (level: string) => (obj: Record<string, unknown>, msg: string) =>
    logged.push({ level, obj, msg });
  const child = {
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
    debug: make("debug"),
    // pino.child() returns another logger — for test purposes we return self
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    child: function (): any {
      return this;
    },
  };
  return {
    apiLogger: child,
    authLogger: child,
    queryLogger: child,
    logger: child,
  };
});

function makeRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
): Request {
  const headerMap = new Map<string, string>(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method,
    url,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
  } as unknown as Request;
}

function makeResponse(status: number): Response {
  return { status } as Response;
}

describe("logRoute", () => {
  beforeEach(() => {
    logged.length = 0;
  });

  it("emits request_start at debug level and request_end at info level on success", async () => {
    const req = makeRequest("POST", "http://localhost/api/query");
    const fn = vi.fn(async () => makeResponse(200));
    await logRoute(req, "query", fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(logged).toHaveLength(2);
    expect(logged[0].level).toBe("debug");
    expect(logged[0].msg).toBe("request_start");
    expect(logged[1].level).toBe("info");
    expect(logged[1].msg).toBe("request_end");
  });

  it("includes method, path, and status in request_end", async () => {
    const req = makeRequest("POST", "http://localhost/api/query");
    await logRoute(req, "query", async () => makeResponse(200));
    const end = logged[1];
    expect(end.obj.method).toBe("POST");
    expect(end.obj.path).toBe("/api/query");
    expect(end.obj.status).toBe(200);
    expect(typeof end.obj.durationMs).toBe("number");
  });

  it("propagates requestId from x-request-id header", async () => {
    const req = makeRequest("GET", "http://localhost/api/dashboards", {
      "x-request-id": "req-abc-123",
    });
    await logRoute(req, "dashboards", async () => makeResponse(200));
    expect(logged[0].obj.requestId).toBe("req-abc-123");
    expect(logged[1].obj.requestId).toBe("req-abc-123");
  });

  it("omits requestId when the header is missing", async () => {
    const req = makeRequest("GET", "http://localhost/api/dashboards");
    await logRoute(req, "dashboards", async () => makeResponse(200));
    expect(logged[0].obj.requestId).toBeUndefined();
  });

  it("records the real status from an error response returned by the handler", async () => {
    const req = makeRequest("POST", "http://localhost/api/query");
    await logRoute(req, "query", async () => makeResponse(500));
    expect(logged[1].obj.status).toBe(500);
    // An error response is still a successful return — no request_error emitted
    expect(logged.some((l) => l.msg === "request_error")).toBe(false);
  });

  it("emits request_error when an exception escapes the handler and re-throws", async () => {
    const req = makeRequest("POST", "http://localhost/api/query");
    const fn = vi.fn(async (): Promise<Response> => {
      throw new Error("boom");
    });

    await expect(logRoute(req, "query", fn)).rejects.toThrow("boom");

    const errEntry = logged.find((l) => l.msg === "request_error");
    expect(errEntry).toBeDefined();
    expect(errEntry?.level).toBe("error");
    expect(errEntry?.obj.method).toBe("POST");
    expect(errEntry?.obj.path).toBe("/api/query");
    expect(typeof errEntry?.obj.durationMs).toBe("number");
    const errObj = errEntry?.obj.err as { message?: string };
    expect(errObj?.message).toBe("boom");
  });

  it("tolerates a relative URL (test mocks)", async () => {
    const req = makeRequest("GET", "/api/connections");
    await logRoute(req, "connections", async () => makeResponse(200));
    expect(logged[1].obj.path).toBe("/api/connections");
  });

  it("measures a non-negative durationMs", async () => {
    const req = makeRequest("POST", "http://localhost/api/query");
    await logRoute(req, "query", async () => makeResponse(200));
    const duration = logged[1].obj.durationMs as number;
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});
