import { describe, it, expect } from "vitest";
import { unwrapResponse } from "../api-client";

/** Helper to build a fake Response with a JSON body. */
function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("unwrapResponse", () => {
  // ---------------------------------------------------------------------------
  // Envelope responses — success
  // ---------------------------------------------------------------------------

  it("extracts data from a success envelope", async () => {
    const res = fakeResponse({ data: { id: "1", name: "Test" }, error: null, meta: null });
    const result = await unwrapResponse<{ id: string; name: string }>(res);
    expect(result).toEqual({ id: "1", name: "Test" });
  });

  it("extracts array data from a list envelope", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    const res = fakeResponse({ data: items, error: null, meta: { total: 2, limit: 25, offset: 0 } });
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
      { data: null, error: { code: "NOT_FOUND", message: "Dashboard not found" }, meta: null },
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

  it("throws generic message on non-ok response with no error field", async () => {
    const res = fakeResponse({}, 500);
    await expect(unwrapResponse(res)).rejects.toThrow("Request failed with status 500");
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("handles raw response with error string on 4xx", async () => {
    const res = fakeResponse({ error: "Unauthorized" }, 401);
    await expect(unwrapResponse(res)).rejects.toThrow("Unauthorized");
  });
});
