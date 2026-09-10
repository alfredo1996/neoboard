import { describe, it, expect, vi } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

vi.mock("next/server", () => nextResponseMockFactory());
// handleRouteError now reads x-request-id via next/headers (async). Default to
// an empty header set; individual tests override to assert correlation.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map<string, string>()),
}));

import {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  serverError,
  handleRouteError,
  validateBody,
  sanitizeErrorMessage,
} from "@/lib/api/api-utils";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";
import { z } from "zod";

describe("error helpers return envelope format", () => {
  it("unauthorized", async () => {
    const res = unauthorized();
    const body = await res.json();
    expect(body).toEqual({
      data: null,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      meta: null,
    });
    expect(res.status).toBe(401);
  });

  it("unauthorized with custom message", async () => {
    const res = unauthorized("Session expired");
    const body = await res.json();
    expect(body.error.message).toBe("Session expired");
  });

  it("forbidden", async () => {
    const res = forbidden();
    const body = await res.json();
    expect(body).toEqual({
      data: null,
      error: { code: "FORBIDDEN", message: "Forbidden" },
      meta: null,
    });
    expect(res.status).toBe(403);
  });

  it("notFound", async () => {
    const res = notFound("User not found");
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(res.status).toBe(404);
  });

  it("badRequest", async () => {
    const res = badRequest("Invalid email");
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(res.status).toBe(400);
  });

  it("serverError", async () => {
    const res = serverError();
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(res.status).toBe(500);
  });
});

describe("handleRouteError", () => {
  it("returns 401 for UnauthorizedError", async () => {
    const res = await handleRouteError(new UnauthorizedError());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for ForbiddenError", async () => {
    const res = await handleRouteError(new ForbiddenError());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 500 with sanitized error message for generic errors", async () => {
    const res = await handleRouteError(new Error("DB connection failed"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // Safe error messages pass through sanitizeErrorMessage
    expect(body.error.message).toBe("DB connection failed");
  });

  it("returns fallback message for bundler-internal errors", async () => {
    const res = await handleRouteError(
      new Error("Cannot find module __TURBOPACK__imported__module__"),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Internal server error");
  });

  it("uses fallback message for non-Error", async () => {
    const res = await handleRouteError("something", "Oops");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Oops");
  });

  it("returns 503 for QueueRejectedError with reason in details", async () => {
    const { QueueRejectedError } = await import("@/lib/query/scheduler");
    const res = await handleRouteError(
      new QueueRejectedError("queue_full", "queue full"),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.details).toEqual({ reason: "queue_full" });
    expect(res.headers.get("Retry-After")).toBe("2");
  });

  it("returns 503 with reason=shed for shedding rejections", async () => {
    const { QueueRejectedError } = await import("@/lib/query/scheduler");
    const res = await handleRouteError(new QueueRejectedError("shed", "shed"));
    const body = await res.json();
    expect(body.error.details).toEqual({ reason: "shed" });
  });

  it("returns 408 for QueueTimeoutError", async () => {
    const { QueueTimeoutError } = await import("@/lib/query/scheduler");
    const res = await handleRouteError(new QueueTimeoutError());
    expect(res.status).toBe(408);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_TIMEOUT");
    expect(res.headers.get("Retry-After")).toBe("5");
  });

  describe("transient driver/connector errors", () => {
    it("returns 408 with Retry-After for ETIMEDOUT driver errors", async () => {
      const res = await handleRouteError(
        new Error("connect ETIMEDOUT 10.0.0.1:5432"),
        "Query execution failed",
      );
      expect(res.status).toBe(408);
      const body = await res.json();
      expect(body.error.code).toBe("REQUEST_TIMEOUT");
      expect(res.headers.get("Retry-After")).toBe("3");
    });

    it("returns 408 for statement_timeout (pg) errors", async () => {
      const res = await handleRouteError(
        new Error("canceling statement due to statement timeout"),
        "Query execution failed",
      );
      expect(res.status).toBe(408);
      expect(res.headers.get("Retry-After")).toBe("3");
    });

    it("preserves the original message on transient 408 so the UI can show it", async () => {
      const res = await handleRouteError(
        new Error("Connection terminated unexpectedly"),
        "Query execution failed",
      );
      const body = await res.json();
      expect(body.error.message).toBe("Connection terminated unexpectedly");
    });

    it("does NOT set Retry-After for permanent failures (syntax error)", async () => {
      const res = await handleRouteError(
        new Error('syntax error at or near "FROM"'),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("does NOT set Retry-After for ECONNREFUSED (service down)", async () => {
      const res = await handleRouteError(
        new Error("connect ECONNREFUSED 127.0.0.1:5432"),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("safeMessage still hides the raw message on transient 408", async () => {
      const res = await handleRouteError(
        new Error("ETIMEDOUT internal db host db-prod-1.internal"),
        "Write query failed",
        { safeMessage: true },
      );
      expect(res.status).toBe(408);
      expect(res.headers.get("Retry-After")).toBe("3");
      const body = await res.json();
      expect(body.error.message).toBe("Write query failed");
      expect(body.error.message).not.toMatch(/db-prod-1/);
    });
  });

  /**
   * #1678 — a dead connector used to fall into the transient branch (a
   * connect timeout says "timeout"), so every widget got 408 + Retry-After
   * and retried three times against a host that never answers.
   */
  describe("connector unavailable (#1678)", () => {
    /** What the connectors throw: `wrapError` names every raw driver error. */
    const connectorError = (message: string) =>
      Object.assign(new Error(message), { name: "ConnectorError" });

    it.each([
      // pg-pool >=3.14 on connectionTimeoutMillis — the exact storm trigger,
      // observed end to end against an unroutable host.
      "Connection terminated due to connection timeout",
      // pg-pool's pool-full wording.
      "timeout exceeded when trying to connect",
      // Neo4j channel on connectionTimeout.
      "Failed to connect to server. Please ensure that your database is listening on the correct host and port. Caused by: Failed to establish connection in 30000ms",
      "connect ETIMEDOUT 10.255.255.1:5432",
      "connect ECONNREFUSED 127.0.0.1:5432",
    ])(
      "returns 502 CONNECTOR_UNAVAILABLE with no Retry-After for %j",
      async (message) => {
        const res = await handleRouteError(
          connectorError(message),
          "Query execution failed",
        );
        expect(res.status).toBe(502);
        expect(res.headers.get("Retry-After")).toBeNull();
        const body = await res.json();
        expect(body.error.code).toBe("CONNECTOR_UNAVAILABLE");
        expect(body.error.details).toEqual({ reason: "network" });
      },
    );

    it("classifies bad credentials as auth_failed, not as a retryable error", async () => {
      const res = await handleRouteError(
        connectorError(
          "The client is unauthorized due to authentication failure.",
        ),
        "Query execution failed",
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.details).toEqual({ reason: "auth_failed" });
    });

    it("classifies the PostgreSQL connector's refused-credentials error as auth_failed", async () => {
      // The exact message PostgresConnectionModule emits when
      // verifyAuthentication resolves false (#1678) — a plain Error there
      // used to fall all the way through to a 500.
      const res = await handleRouteError(
        connectorError(
          "PostgreSQL authentication failed: the server rejected the username or password",
        ),
        "Query execution failed",
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.code).toBe("CONNECTOR_UNAVAILABLE");
      expect(body.error.details).toEqual({ reason: "auth_failed" });
    });

    it("keeps a genuine statement timeout on the 408 retry path", async () => {
      const res = await handleRouteError(
        connectorError("canceling statement due to statement timeout"),
        "Query execution failed",
      );
      expect(res.status).toBe(408);
      expect(res.headers.get("Retry-After")).toBe("3");
    });

    it("keeps a pool-acquisition timeout on the 408 retry path", async () => {
      const res = await handleRouteError(
        connectorError(
          "Connection acquisition timed out in 60000 ms. Pool status: Active conn count = 100, Idle conn count = 0.",
        ),
        "Query execution failed",
      );
      expect(res.status).toBe(408);
    });

    it("only classifies errors the connectors raised — the app's own DB being down is still a 500", async () => {
      // Same message, plain Error: this is drizzle/pg talking to NeoBoard's
      // own database. Telling the user to check *their* connector's host
      // would be a misdiagnosis.
      const res = await handleRouteError(
        new Error("connect ECONNREFUSED 127.0.0.1:5432"),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
    });

    it("does not swallow an app-level Unauthorized into auth_failed", async () => {
      // api-key.ts throws a plain Error("Unauthorized"); the classifier's
      // auth keyword list contains "unauthorized".
      const res = await handleRouteError(new Error("Unauthorized"));
      expect(res.status).toBe(401);
    });

    it("sanitizes the driver message on the 502", async () => {
      const res = await handleRouteError(
        connectorError(
          "connect ECONNREFUSED postgresql://neo:s3cret@db.internal:5432/x",
        ),
        "Query execution failed",
      );
      const body = await res.json();
      expect(body.error.message).not.toMatch(/s3cret/);
    });

    it("safeMessage collapses the 502 message to the fallback", async () => {
      const res = await handleRouteError(
        connectorError("connect ECONNREFUSED db-prod-1.internal:5432"),
        "Write query failed",
        { safeMessage: true },
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.message).toBe("Write query failed");
    });
  });

  describe("safeMessage option", () => {
    it("collapses raw driver errors to fallback when safeMessage=true", async () => {
      const res = await handleRouteError(
        new Error('syntax error at or near "THIS"'),
        "Write query execution failed",
        { safeMessage: true },
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe("Write query execution failed");
      expect(body.error.message).not.toMatch(/syntax error/i);
    });

    it("still returns raw driver errors when safeMessage is omitted", async () => {
      const res = await handleRouteError(
        new Error('syntax error at or near "THIS"'),
        "Write query execution failed",
      );
      const body = await res.json();
      expect(body.error.message).toBe('syntax error at or near "THIS"');
    });

    it("safeMessage does not bypass typed app errors (Queue/Auth/etc.)", async () => {
      const { QueueTimeoutError } = await import("@/lib/query/scheduler");
      const res = await handleRouteError(
        new QueueTimeoutError(),
        "Write failed",
        {
          safeMessage: true,
        },
      );
      // QueueTimeoutError still gets its specific 408 + Retry-After handling.
      expect(res.status).toBe(408);
      expect(res.headers.get("Retry-After")).toBe("5");
    });
  });

  it("logs the x-request-id correlation id with api_error (#1220)", async () => {
    const { headers } = await import("next/headers");
    vi.mocked(headers).mockResolvedValueOnce(
      new Map([["x-request-id", "req-abc-123"]]) as unknown as Awaited<
        ReturnType<typeof headers>
      >,
    );
    const { apiLogger } = await import("@/lib/logger");
    const errSpy = vi
      .spyOn(apiLogger, "error")
      .mockReturnValue(undefined as never);

    await handleRouteError(new Error("kaboom"));

    expect(errSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "api_error", requestId: "req-abc-123" }),
      "api_error",
    );
    errSpy.mockRestore();
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns success with parsed data", () => {
    const result = validateBody(schema, { name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Test");
  });

  it("returns envelope error on validation failure", async () => {
    const result = validateBody(schema, { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("sanitizeErrorMessage", () => {
  it("returns user-readable message as-is", () => {
    expect(sanitizeErrorMessage("Connection refused")).toBe(
      "Connection refused",
    );
  });

  it("strips Turbopack internal paths", () => {
    const raw =
      "(0 , __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$src$2f$lib.ts__$5b$app$2d$route$5d$.createConnectionModule) is not a function";
    expect(sanitizeErrorMessage(raw)).toBe(
      "Internal server error — check server logs",
    );
  });

  it("strips webpack internal paths", () => {
    const raw = "__webpack_require__ is not defined";
    expect(sanitizeErrorMessage(raw)).toBe(
      "Internal server error — check server logs",
    );
  });

  it("strips encoded module paths with $XX$ pattern", () => {
    const raw = "Error at $5b$module$5d$ resolution";
    expect(sanitizeErrorMessage(raw)).toBe(
      "Internal server error — check server logs",
    );
  });

  it("uses custom fallback", () => {
    expect(sanitizeErrorMessage("__TURBOPACK__foo", "Connection failed")).toBe(
      "Connection failed",
    );
  });

  it("preserves short error messages", () => {
    expect(sanitizeErrorMessage("ECONNREFUSED")).toBe("ECONNREFUSED");
  });

  // Driver messages become API responses. A reader can trigger a query
  // against a connection whose URI they are not allowed to see, so a driver
  // that echoes the connection string must not hand them the password (#1227).
  it("strips a connection URI password out of a driver message", () => {
    const out = sanitizeErrorMessage(
      "connect ECONNREFUSED postgresql://neoboard:Tr0ub4dor-hunter2@db.internal:5432/analytics",
    );
    expect(out).not.toContain("Tr0ub4dor-hunter2");
    expect(out).toContain("ECONNREFUSED");
    expect(out).toContain("db.internal");
  });

  it("strips an inline password literal out of an echoed statement", () => {
    const out = sanitizeErrorMessage(
      "syntax error at or near \"WITH\": ALTER USER bob WITH PASSWORD 'Tr0ub4dor-hunter2'",
    );
    expect(out).not.toContain("Tr0ub4dor-hunter2");
    expect(out).toContain("syntax error at or near");
  });
});
