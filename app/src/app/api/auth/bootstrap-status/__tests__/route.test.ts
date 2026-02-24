import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — defined at module level so vi.doMock closures can reference them,
// but registered only inside beforeEach (after vi.resetModules) to avoid the
// redundant top-level vi.mock calls that are ignored when resetModules is used.
// ---------------------------------------------------------------------------

const mockAreUsersEmpty = vi.fn<() => Promise<boolean>>();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/auth/bootstrap-status", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/signup", () => ({ areUsersEmpty: mockAreUsersEmpty }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: ResponseInit) => ({
          _body: body,
          status: init?.status ?? 200,
          json: async () => body,
        }),
      },
    }));
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns bootstrapRequired: true when no users exist", async () => {
    mockAreUsersEmpty.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res._body).toEqual({ bootstrapRequired: true });
  });

  it("returns bootstrapRequired: false when users exist", async () => {
    mockAreUsersEmpty.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res._body).toEqual({ bootstrapRequired: false });
  });
});
