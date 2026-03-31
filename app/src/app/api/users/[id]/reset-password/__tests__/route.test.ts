import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeUpdateChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest, makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockRequireAdmin =
  vi.fn<
    () => Promise<{ userId: string; canWrite: boolean; tenantId: string }>
  >();

const mockDb = {
  update: vi.fn(),
};

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));
vi.mock("next/server", () => nextResponseMockFactory());

const ADMIN = { userId: "admin-1", canWrite: true, tenantId: "default" };
const READONLY_ADMIN = {
  userId: "admin-1",
  canWrite: false,
  tenantId: "default",
};

describe("POST /api/users/[id]/reset-password", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("bcryptjs", () => ({
      default: { hash: vi.fn().mockResolvedValue("hashed-password") },
    }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      makeRequest({ newPassword: "newpass123" }),
      makeParams("u1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when admin has canWrite=false", async () => {
    mockRequireAdmin.mockResolvedValue(READONLY_ADMIN);
    const res = await POST(
      makeRequest({ newPassword: "newpass123" }),
      makeParams("u1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to reset own password", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await POST(
      makeRequest({ newPassword: "newpass123" }),
      makeParams("admin-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await POST(
      makeRequest({ newPassword: "12345" }),
      makeParams("u1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await POST(
      makeRequest({ newPassword: "newpass123" }),
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("resets password and returns success", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "u1" }]));
    const res = await POST(
      makeRequest({ newPassword: "newpass123" }),
      makeParams("u1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reset).toBe(true);
  });
});
