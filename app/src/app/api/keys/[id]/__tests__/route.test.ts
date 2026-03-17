import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDeleteChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();

const mockDb = {
  delete: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests — DELETE /api/keys/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/keys/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
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
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    // Simulate that delete filtered by userId+tenantId found nothing
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE({} as Request, makeParams("other-users-key"));
    expect(res.status).toBe(404);
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
