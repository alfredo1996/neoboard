import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();

function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function makeShareSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function makeInsertChain(rows: unknown[]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(rows),
    }),
  };
}

let selectCallCount = 0;
const mockDb = {
  select: vi.fn(() => {
    selectCallCount++;
    // First select is for dashboard, second for shares
    if (selectCallCount === 1) return makeSelectChain([]);
    return makeShareSelectChain([]);
  }),
  insert: vi.fn(() => makeInsertChain([])),
};

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/dashboards/[id]/duplicate", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    selectCallCount = 0;
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is reader", async () => {
    mockRequireSession.mockResolvedValue({ userId: "u1", role: "reader" });
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(403);
    expect(res._body.error.message).toBe("Forbidden");
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "u1", role: "creator" });
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 201 and copies dashboard for owner", async () => {
    mockRequireSession.mockResolvedValue({ userId: "u1", role: "creator" });
    const source = {
      id: "d1",
      userId: "u1",
      name: "My Dashboard",
      description: "desc",
      layoutJson: { version: 2, pages: [] },
      isPublic: true,
    };
    const copy = { ...source, id: "d2", name: "My Dashboard (copy)", isPublic: false };
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([copy]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(201);
    expect(res._body.data.name).toBe("My Dashboard (copy)");
  });

  it("admin can duplicate any dashboard (bypasses ownership)", async () => {
    mockRequireSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
    const source = { id: "d1", userId: "other-user", name: "Other Dashboard" };
    const copy = { id: "d2", name: "Other Dashboard (copy)" };
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([copy]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(201);
  });

  it("returns 404 when creator is not owner and has no share", async () => {
    mockRequireSession.mockResolvedValue({ userId: "u2", role: "creator" });
    const source = { id: "d1", userId: "u1", name: "Other Dashboard" };
    // First select: dashboard found (owned by u1)
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    // Second select: no share entry for u2
    mockDb.select.mockReturnValueOnce(makeShareSelectChain([]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("allows duplication when creator has share entry", async () => {
    mockRequireSession.mockResolvedValue({ userId: "u2", role: "creator" });
    const source = {
      id: "d1",
      userId: "u1",
      name: "Shared Dashboard",
      description: null,
      layoutJson: { version: 2, pages: [] },
    };
    const copy = { id: "d2", name: "Shared Dashboard (copy)" };
    // First select: dashboard found
    mockDb.select.mockReturnValueOnce(makeSelectChain([source]));
    // Second select: share entry exists
    mockDb.select.mockReturnValueOnce(makeShareSelectChain([{ id: "share-1" }]));
    mockDb.insert.mockReturnValueOnce(makeInsertChain([copy]));

    const res = await POST({} as Request, makeParams("d1"));
    expect(res.status).toBe(201);
  });
});
