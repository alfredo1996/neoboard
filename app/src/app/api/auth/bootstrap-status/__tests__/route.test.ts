import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAreUsersEmpty = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/auth/signup", () => ({
  areUsersEmpty: mockAreUsersEmpty,
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

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
