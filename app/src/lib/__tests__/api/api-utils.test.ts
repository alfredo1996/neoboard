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
import {
  ConnectorError,
  ConnectorErrorType,
  type ConnectorErrorClassification,
} from "@neoboard/connection";
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

  /**
   * What a connector raises (#1903): a ConnectorError carrying the verdict of
   * its own `classifyError` hook. The route reads that verdict and nothing
   * else — the message below is opaque to it, whichever driver wrote it.
   */
  const classified = (
    classification: Partial<ConnectorErrorClassification>,
    message = "the driver's own words",
  ) =>
    new ConnectorError(message, {
      type: ConnectorErrorType.QUERY,
      transient: false,
      ...classification,
    });

  describe("transient connector errors", () => {
    it("returns 408 with Retry-After for an error its connector calls transient", async () => {
      const res = await handleRouteError(
        classified({ type: ConnectorErrorType.TIMEOUT, transient: true }),
        "Query execution failed",
      );
      expect(res.status).toBe(408);
      const body = await res.json();
      expect(body.error.code).toBe("REQUEST_TIMEOUT");
      expect(res.headers.get("Retry-After")).toBe("3");
    });

    it("preserves the original message on transient 408 so the UI can show it", async () => {
      const res = await handleRouteError(
        classified({ transient: true }, "The backend went away"),
        "Query execution failed",
      );
      const body = await res.json();
      expect(body.error.message).toBe("The backend went away");
    });

    it("redacts a credential the driver put in a transient message", async () => {
      // The 408 path used to return the driver's message raw while the 502 path
      // sanitized it, so a retryable error that quoted the connection URI
      // handed the password to the browser.
      const res = await handleRouteError(
        classified(
          { transient: true },
          "connection to neo4j://neo4j:s3cr3t@db.internal:7687 was reset",
        ),
        "Query execution failed",
      );
      expect(res.status).toBe(408);
      const body = await res.json();
      expect(body.error.message).not.toMatch(/s3cr3t/);
      expect(body.error.message).toContain("db.internal");
    });

    it("does NOT set Retry-After for a permanent failure", async () => {
      const res = await handleRouteError(
        classified({ transient: false }),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("never retries on the strength of a message: only a connector's verdict counts", async () => {
      // No keyword list is left in the app. An error nobody classified — a bug,
      // NeoBoard's own database — is a 500, whatever it happens to say.
      const res = await handleRouteError(
        new Error("timeout ETIMEDOUT connection reset"),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
    });

    it("safeMessage still hides the raw message on transient 408", async () => {
      const res = await handleRouteError(
        classified({ transient: true }, "lost db-prod-1.internal"),
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
    it.each([
      ["a host nobody can reach", { transient: false }],
      // The storm trigger: a connect timeout is BOTH unreachable and, by its
      // wording, transient. Unavailable is decided first.
      ["a connect timeout, which is also transient", { transient: true }],
    ])(
      "returns 502 CONNECTOR_UNAVAILABLE with no Retry-After for %s",
      async (_label, flags) => {
        const res = await handleRouteError(
          classified({ type: ConnectorErrorType.NETWORK, ...flags }),
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
        classified({ type: ConnectorErrorType.AUTHENTICATION }),
        "Query execution failed",
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.code).toBe("CONNECTOR_UNAVAILABLE");
      expect(body.error.details).toEqual({ reason: "auth_failed" });
    });

    it.each([
      ConnectorErrorType.TIMEOUT,
      ConnectorErrorType.CONNECTION,
      ConnectorErrorType.QUERY,
    ])(
      "keeps a transient %s on the 408 retry path: the connector answered",
      async (type) => {
        const res = await handleRouteError(
          classified({ type, transient: true }),
          "Query execution failed",
        );
        expect(res.status).toBe(408);
        expect(res.headers.get("Retry-After")).toBe("3");
      },
    );

    it("only acts on errors the connectors raised — the app's own DB being down is still a 500", async () => {
      // A plain Error: this is NeoBoard's own database talking. Telling the
      // user to check *their* connector's host would be a misdiagnosis.
      const res = await handleRouteError(
        Object.assign(new Error("refused"), {
          classification: { type: "NETWORK", transient: false },
        }),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
    });

    it("does not swallow an app-level Unauthorized into auth_failed", async () => {
      const res = await handleRouteError(new UnauthorizedError());
      expect(res.status).toBe(401);
    });

    // #1962: 401 and 403 are our own typed errors, never words in a message.
    // A driver error that happens to say "session" used to tell a signed-in
    // user to sign in again.
    it("answers a query error that names a session table as the query error it is", async () => {
      const res = await handleRouteError(
        classified({}, 'relation "session" does not exist'),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.message).toBe('relation "session" does not exist');
    });

    it.each(["Unauthorized", "Forbidden", "session expired"])(
      "does not read auth into a plain error that says %j",
      async (message) => {
        const res = await handleRouteError(new Error(message));
        expect(res.status).toBe(500);
      },
    );

    it("sanitizes the driver message on the 502", async () => {
      const res = await handleRouteError(
        classified(
          { type: ConnectorErrorType.NETWORK },
          "refused by fixturedb://neo:s3cret@db.internal:5432/x",
        ),
        "Query execution failed",
      );
      const body = await res.json();
      expect(body.error.message).not.toMatch(/s3cret/);
    });

    it("safeMessage collapses the 502 message to the fallback", async () => {
      const res = await handleRouteError(
        classified(
          { type: ConnectorErrorType.NETWORK },
          "refused by db-prod-1.internal:5432",
        ),
        "Write query failed",
        { safeMessage: true },
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error.message).toBe("Write query failed");
    });
  });

  /**
   * #1903 — the preview's "this query writes" used to be a regex over the
   * message, run in the browser. The connector flags it now, and the route
   * passes the flag on beside the (unchanged) message.
   */
  describe("blocked write", () => {
    it("passes the connector's blockedWrite flag to the client as details", async () => {
      const res = await handleRouteError(
        classified({ blockedWrite: true }, "cannot write here"),
        "Query execution failed",
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toEqual({
        code: "INTERNAL_ERROR",
        message: "cannot write here",
        details: { blockedWrite: true },
      });
    });

    it("sends no details for any other error", async () => {
      const res = await handleRouteError(classified({}), "Query failed");
      const body = await res.json();
      expect(body.error.details).toBeUndefined();
    });

    it("sends nothing but the fallback on a safeMessage route", async () => {
      const res = await handleRouteError(
        classified({ blockedWrite: true }, "cannot write here"),
        "Write query failed",
        { safeMessage: true },
      );
      const body = await res.json();
      expect(body.error).toEqual({
        code: "INTERNAL_ERROR",
        message: "Write query failed",
      });
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
