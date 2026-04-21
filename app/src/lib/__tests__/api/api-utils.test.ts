import { describe, it, expect, vi } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

vi.mock("next/server", () => nextResponseMockFactory());

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
    const res = handleRouteError(new UnauthorizedError());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for ForbiddenError", async () => {
    const res = handleRouteError(new ForbiddenError());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 500 with fallback message for generic errors (not leaking)", async () => {
    const res = handleRouteError(new Error("DB connection failed"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // Raw driver errors must not leak — fallback is returned instead.
    expect(body.error.message).toBe("Internal server error");
  });

  it("uses fallback message for non-Error", async () => {
    const res = handleRouteError("something", "Oops");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Oops");
  });

  it("returns 503 for QueueRejectedError with reason in details", async () => {
    const { QueueRejectedError } = await import("@/lib/query/scheduler");
    const res = handleRouteError(
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
    const res = handleRouteError(new QueueRejectedError("shed", "shed"));
    const body = await res.json();
    expect(body.error.details).toEqual({ reason: "shed" });
  });

  it("returns 408 for QueueTimeoutError", async () => {
    const { QueueTimeoutError } = await import("@/lib/query/scheduler");
    const res = handleRouteError(new QueueTimeoutError());
    expect(res.status).toBe(408);
    const body = await res.json();
    expect(body.error.code).toBe("REQUEST_TIMEOUT");
    expect(res.headers.get("Retry-After")).toBe("5");
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
});
