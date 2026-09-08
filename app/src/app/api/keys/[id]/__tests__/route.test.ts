import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeDeleteChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();

const mockDb = {
  delete: vi.fn(),
};

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests — DELETE /api/keys/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/keys/[id]", () => {
  let DELETE: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireSession: mockRequireSession,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE({} as Request, makeParams("key-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks canWrite permission", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "reader",
      canWrite: false,
    });
    const res = await DELETE({} as Request, makeParams("key-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when key doesn't exist", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    // No rows deleted
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE({} as Request, makeParams("nonexistent-key"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when key belongs to different user", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-x",
      role: "creator",
      canWrite: true,
    });
    // Simulate that delete filtered by userId+tenantId found nothing
    const chain = makeDeleteChain([]);
    mockDb.delete.mockReturnValue(chain);
    const res = await DELETE({} as Request, makeParams("other-users-key"));
    expect(res.status).toBe(404);
    // The 404 must come from the filter, not from the mock — assert the
    // delete was scoped to the caller's user AND tenant (#1607).
    expect(chain.calls.where).toHaveLength(1);
    const [expr] = chain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["id", "userId", "tenant_id"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["other-users-key", "user-1", "tenant-x"]),
    );
  });

  it("returns 200 and deletes key on valid request", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockDb.delete.mockReturnValue(makeDeleteChain([{ id: "key-1" }]));
    const res = await DELETE({} as Request, makeParams("key-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ success: true });
  });
});
