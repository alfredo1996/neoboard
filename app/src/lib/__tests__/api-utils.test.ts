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
} from "../api-utils";
import { z } from "zod";

describe("error helpers return envelope format", () => {
  it("unauthorized", () => {
    const res = unauthorized();
    expect(res._body).toEqual({
      data: null,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
      meta: null,
    });
    expect(res.status).toBe(401);
  });

  it("unauthorized with custom message", () => {
    const res = unauthorized("Session expired");
    expect(res._body.error.message).toBe("Session expired");
  });

  it("forbidden", () => {
    const res = forbidden();
    expect(res._body).toEqual({
      data: null,
      error: { code: "FORBIDDEN", message: "Forbidden" },
      meta: null,
    });
    expect(res.status).toBe(403);
  });

  it("notFound", () => {
    const res = notFound("User not found");
    expect(res._body.error.code).toBe("NOT_FOUND");
    expect(res.status).toBe(404);
  });

  it("badRequest", () => {
    const res = badRequest("Invalid email");
    expect(res._body.error.code).toBe("BAD_REQUEST");
    expect(res.status).toBe(400);
  });

  it("serverError", () => {
    const res = serverError();
    expect(res._body.error.code).toBe("INTERNAL_ERROR");
    expect(res.status).toBe(500);
  });
});

describe("handleRouteError", () => {
  it("returns 401 for Unauthorized errors", () => {
    const res = handleRouteError(new Error("Unauthorized"));
    expect(res.status).toBe(401);
    expect(res._body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for Forbidden errors", () => {
    const res = handleRouteError(new Error("Forbidden"));
    expect(res.status).toBe(403);
    expect(res._body.error.code).toBe("FORBIDDEN");
  });

  it("returns 500 for generic errors", () => {
    const res = handleRouteError(new Error("DB connection failed"));
    expect(res.status).toBe(500);
    expect(res._body.error.code).toBe("INTERNAL_ERROR");
  });

  it("uses fallback message for non-Error", () => {
    const res = handleRouteError("something", "Oops");
    expect(res.status).toBe(500);
    expect(res._body.error.message).toBe("Oops");
  });
});

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns success with parsed data", () => {
    const result = validateBody(schema, { name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Test");
  });

  it("returns envelope error on validation failure", () => {
    const result = validateBody(schema, { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      expect(result.response._body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});
