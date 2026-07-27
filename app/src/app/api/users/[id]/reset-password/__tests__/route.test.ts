import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeUpdateChain } from "@/__tests__/helpers/drizzle-mocks";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

const mockAuditRequest = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: mockRequireAdmin,
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Audit is mocked so route assertions aren't polluted by its own db.insert.
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests — POST /api/users/[id]/reset-password
// ---------------------------------------------------------------------------

describe("POST /api/users/[id]/reset-password", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("user-2"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when admin cannot write", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: false,
      tenantId: "tenant-a",
    });
    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("user-2"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin tries to reset own password", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("admin-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns error when body is invalid", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    const res = await POST(makeRequest({}), makeParams("user-2"));
    // Route catches the error via handleRouteError, returns non-200
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("resets password for a user in the same tenant", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "user-2" }]));
    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("user-2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reset).toBe(true);
  });

  it("returns 404 when target user belongs to a different tenant", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    // Simulate no rows returned because tenant filter excludes user from tenant-b
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("user-in-tenant-b"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("User not found");
  });

  it("returns generated password when generatePassword is true", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "user-2" }]));
    const res = await POST(
      makeRequest({ generatePassword: true }),
      makeParams("user-2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reset).toBe(true);
    expect(body.data.generatedPassword).toBeDefined();
    expect(typeof body.data.generatedPassword).toBe("string");
  });

  it("records a user.password.reset audit entry with no password (#1234)", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "user-2" }]));

    await POST(
      makeRequest({ newPassword: "NewPassword1!", forcePasswordChange: true }),
      makeParams("user-2"),
    );

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "user.password.reset",
      resourceType: "user",
      resourceId: "user-2",
      tenantId: "tenant-a",
      userId: "admin-1",
    });
    // The password — supplied or generated — must never reach the trail.
    expect(JSON.stringify(entry)).not.toContain("NewPassword1!");
  });

  it("does not record the generated password either (#1234)", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    mockDb.update.mockReturnValue(makeUpdateChain([{ id: "user-2" }]));

    const res = await POST(
      makeRequest({ generatePassword: true }),
      makeParams("user-2"),
    );
    const { data } = await res.json();

    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(JSON.stringify(entry)).not.toContain(data.generatedPassword);
  });

  it("writes no audit entry when the target user is not found (#1234)", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    mockDb.update.mockReturnValue(makeUpdateChain([]));

    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("user-in-tenant-b"),
    );

    expect(res.status).toBe(404);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("sets passwordChangedAt when admin resets password", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin-1",
      canWrite: true,
      tenantId: "tenant-a",
    });
    let capturedFields: Record<string, unknown> = {};
    const mockSet = vi.fn().mockImplementation((fields) => {
      capturedFields = fields;
      return {
        where: () => ({
          returning: () => Promise.resolve([{ id: "user-2" }]),
        }),
      };
    });
    mockDb.update.mockReturnValue({ set: mockSet });

    const res = await POST(
      makeRequest({ newPassword: "NewPassword1!" }),
      makeParams("user-2"),
    );
    expect(res.status).toBe(200);
    expect(capturedFields.passwordChangedAt).toBeInstanceOf(Date);
  });
});
