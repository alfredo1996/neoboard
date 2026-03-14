import { describe, it, expect, vi } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

vi.mock("next/server", () => nextResponseMockFactory());

import { apiSuccess, apiList, apiError, parsePagination } from "../api-response";

describe("apiSuccess", () => {
  it("wraps data in envelope with status 200", async () => {
    const res = apiSuccess({ id: "1", name: "Test" });
    const body = await res.json();
    expect(body).toEqual({
      data: { id: "1", name: "Test" },
      error: null,
      meta: null,
    });
    expect(res.status).toBe(200);
  });

  it("accepts custom status code", async () => {
    const res = apiSuccess({ id: "1" }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("1");
  });

  it("accepts custom meta", async () => {
    const res = apiSuccess({ id: "1" }, 200, { resultId: "abc" });
    const body = await res.json();
    expect(body.meta).toEqual({ resultId: "abc" });
  });
});

describe("apiList", () => {
  it("wraps array with pagination meta", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    const res = apiList(items, { total: 50, limit: 25, offset: 0 });
    const body = await res.json();
    expect(body).toEqual({
      data: items,
      error: null,
      meta: { total: 50, limit: 25, offset: 0 },
    });
    expect(res.status).toBe(200);
  });
});

describe("apiError", () => {
  it("returns NOT_FOUND with 404", async () => {
    const res = apiError("NOT_FOUND", "Dashboard not found");
    const body = await res.json();
    expect(body).toEqual({
      data: null,
      error: { code: "NOT_FOUND", message: "Dashboard not found" },
      meta: null,
    });
    expect(res.status).toBe(404);
  });

  it("returns UNAUTHORIZED with 401", () => {
    const res = apiError("UNAUTHORIZED", "Not logged in");
    expect(res.status).toBe(401);
  });

  it("returns FORBIDDEN with 403", () => {
    const res = apiError("FORBIDDEN", "No access");
    expect(res.status).toBe(403);
  });

  it("returns BAD_REQUEST with 400", () => {
    const res = apiError("BAD_REQUEST", "Invalid input");
    expect(res.status).toBe(400);
  });

  it("returns VALIDATION_ERROR with 400", () => {
    const res = apiError("VALIDATION_ERROR", "Name required");
    expect(res.status).toBe(400);
  });

  it("returns CONFLICT with 409", () => {
    const res = apiError("CONFLICT", "Already exists");
    expect(res.status).toBe(409);
  });

  it("returns INTERNAL_ERROR with 500", () => {
    const res = apiError("INTERNAL_ERROR", "Something broke");
    expect(res.status).toBe(500);
  });
});

describe("parsePagination", () => {
  function req(url: string) {
    return { url } as Request;
  }

  it("returns defaults when no params", () => {
    expect(parsePagination(req("http://x/api/users"))).toEqual({
      limit: 25,
      offset: 0,
    });
  });

  it("parses limit and offset", () => {
    expect(parsePagination(req("http://x/api/users?limit=50&offset=10"))).toEqual({
      limit: 50,
      offset: 10,
    });
  });

  it("caps limit at 1000", () => {
    expect(parsePagination(req("http://x/api/users?limit=5000"))).toEqual({
      limit: 1000,
      offset: 0,
    });
  });

  it("defaults negative limit", () => {
    expect(parsePagination(req("http://x/api/users?limit=-1"))).toEqual({
      limit: 25,
      offset: 0,
    });
  });

  it("defaults negative offset to 0", () => {
    expect(parsePagination(req("http://x/api/users?offset=-5"))).toEqual({
      limit: 25,
      offset: 0,
    });
  });

  it("handles non-numeric values", () => {
    expect(parsePagination(req("http://x/api/users?limit=abc"))).toEqual({
      limit: 25,
      offset: 0,
    });
  });
});
