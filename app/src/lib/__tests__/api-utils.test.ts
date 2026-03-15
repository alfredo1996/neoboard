import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

vi.mock("next/server", () => nextResponseMockFactory());

describe("api-utils", () => {
  let unauthorized: (msg?: string) => { status: number };
  let forbidden: (msg?: string) => { status: number };
  let notFound: (msg?: string) => { status: number };
  let badRequest: (msg: string) => { status: number };
  let serverError: (msg?: string) => { status: number };
  let handleRouteError: (
    error: unknown,
    fallbackMsg?: string
  ) => { status: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let validateBody: (...args: any[]) => any;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../api-utils");
    unauthorized = mod.unauthorized;
    forbidden = mod.forbidden;
    notFound = mod.notFound;
    badRequest = mod.badRequest;
    serverError = mod.serverError;
    handleRouteError = mod.handleRouteError;
    validateBody = mod.validateBody;
  });

  // -----------------------------------------------------------------------
  // Error helpers
  // -----------------------------------------------------------------------

  it("unauthorized returns 401 with default message", () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
  });

  it("forbidden returns 403 with default message", () => {
    const res = forbidden();
    expect(res.status).toBe(403);
  });

  it("notFound returns 404 with default message", () => {
    const res = notFound();
    expect(res.status).toBe(404);
  });

  it("badRequest returns 400", () => {
    const res = badRequest("invalid input");
    expect(res.status).toBe(400);
  });

  it("serverError returns 500 with default message", () => {
    const res = serverError();
    expect(res.status).toBe(500);
  });

  // -----------------------------------------------------------------------
  // handleRouteError
  // -----------------------------------------------------------------------

  it("returns 401 for Unauthorized errors", () => {
    const res = handleRouteError(new Error("Unauthorized"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for session-related errors", () => {
    const res = handleRouteError(new Error("Invalid session"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for Forbidden errors", () => {
    const res = handleRouteError(new Error("Forbidden"));
    expect(res.status).toBe(403);
  });

  it("returns 500 with error message for other errors", () => {
    const res = handleRouteError(new Error("DB connection failed"));
    expect(res.status).toBe(500);
  });

  it("returns 500 with fallback for non-Error objects", () => {
    const res = handleRouteError("string error", "Something went wrong");
    expect(res.status).toBe(500);
  });

  // -----------------------------------------------------------------------
  // validateBody
  // -----------------------------------------------------------------------

  it("returns success with parsed data on valid input", async () => {
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1) });
    const result = validateBody(schema, { name: "hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("hello");
    }
  });

  it("returns failure with 400 response on invalid input", async () => {
    const { z } = await import("zod");
    const schema = z.object({ name: z.string().min(1) });
    const result = validateBody(schema, { name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});
