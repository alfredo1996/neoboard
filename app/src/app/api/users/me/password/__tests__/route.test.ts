import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "@/lib/auth/errors";

const mockSession = {
  userId: "u1",
  role: "creator",
  canWrite: true,
  tenantId: "default",
};
const { requireSession } = vi.hoisted(() => ({ requireSession: vi.fn() }));
requireSession.mockResolvedValue(mockSession);
vi.mock("@/lib/auth/session", () => ({ requireSession }));

const mockUser = { id: "u1", passwordHash: "$2a$12$fakehash" };
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
});
vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "id", passwordHash: "passwordHash" },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("$2a$12$newhash"),
  },
}));

const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));

const mockUnstableUpdate = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/auth/config", () => ({
  unstable_update: mockUnstableUpdate,
}));

import bcrypt from "bcryptjs";

/** #2011: every answer is `{ data, error, meta }`, as from every other route. */
async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(body).toEqual({
    data: null,
    error: { code, message: expect.any(String) },
    meta: null,
  });
  return body.error.message as string;
}

const VALID = JSON.stringify({
  currentPassword: "old123",
  newPassword: "newPass1",
});

describe("PUT /api/users/me/password", () => {
  let PUT: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Setup default select chain
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([mockUser]) }),
      }),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const mod = await import("../route");
    PUT = mod.PUT;
  });

  it("returns 400 when body is missing fields", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    await expectError(await PUT(req), 400, "VALIDATION_ERROR");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 when new password is too short", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword: "old123", newPassword: "short" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(await expectError(await PUT(req), 400, "VALIDATION_ERROR")).toBe(
      "Password must be at least 8 characters",
    );
  });

  it("returns 400 when new password lacks a letter", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old123",
        newPassword: "12345678",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when new password lacks a number", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old123",
        newPassword: "abcdefgh",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when current password is wrong", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "wrong",
        newPassword: "newPass1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(await expectError(await PUT(req), 403, "FORBIDDEN")).toBe(
      "Current password is incorrect",
    );
  });

  it("answers 413 for a body larger than the proxy passes on (#2011)", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: VALID,
      headers: {
        "Content-Type": "application/json",
        "content-length": String(11 * 1024 * 1024),
      },
    });
    await expectError(await PUT(req), 413, "PAYLOAD_TOO_LARGE");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("answers 401 in the envelope without a session (#2011)", async () => {
    requireSession.mockRejectedValueOnce(new UnauthorizedError());
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: VALID,
    });
    await expectError(await PUT(req), 401, "UNAUTHORIZED");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 200 and updates password on success", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old123",
        newPassword: "newPass1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { success: true },
      error: null,
      meta: null,
    });
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("sets passwordChangedAt when password is changed", async () => {
    let capturedFields: Record<string, unknown> = {};
    const mockSet = vi.fn().mockImplementation((fields) => {
      capturedFields = fields;
      return { where: vi.fn().mockResolvedValue(undefined) };
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old123",
        newPassword: "newPass1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(capturedFields.passwordChangedAt).toBeInstanceOf(Date);
  });

  it("refreshes the session cookie after a successful change", async () => {
    // Without this the proxy keeps reading forcePasswordChange=true from
    // the stale JWT cookie and bounces the user back to /change-password.
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old123",
        newPassword: "newPass1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(mockUnstableUpdate).toHaveBeenCalled();
  });

  it("does not refresh the session cookie when the current password is wrong", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "wrong",
        newPassword: "newPass1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    await PUT(req);
    expect(mockUnstableUpdate).not.toHaveBeenCalled();
  });

  it("still returns 200 when the cookie refresh fails", async () => {
    mockUnstableUpdate.mockRejectedValueOnce(new Error("cookie store gone"));
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: "old123",
        newPassword: "newPass1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
  });

  describe("audit (#1276)", () => {
    const put = (body: unknown) =>
      new Request("http://localhost/api/users/me/password", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });

    it("writes exactly one user.password.change entry with no password material", async () => {
      const req = put({
        currentPassword: "OldSecret1",
        newPassword: "NewSecret1",
      });
      const res = await PUT(req);
      expect(res.status).toBe(200);
      expect(mockAuditRequest).toHaveBeenCalledTimes(1);
      const [auditedReq, entry] = mockAuditRequest.mock.calls[0];
      expect(auditedReq).toBe(req);
      // Exact match: any extra key (e.g. derived password data) fails.
      expect(entry).toEqual({
        action: "user.password.change",
        resourceType: "user",
        resourceId: "u1",
        tenantId: "default",
        userId: "u1",
      });
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain("OldSecret1");
      expect(serialized).not.toContain("NewSecret1");
      expect(serialized).not.toContain("$2a$12$");
    });

    it("takes tenantId and userId from the session, never the body", async () => {
      await PUT(
        put({
          currentPassword: "old123",
          newPassword: "newPass1",
          tenantId: "evil-tenant",
          userId: "evil-user",
        }),
      );
      const [, entry] = mockAuditRequest.mock.calls[0];
      expect(entry.tenantId).toBe("default");
      expect(entry.userId).toBe("u1");
    });

    it("still audits when the cookie refresh fails", async () => {
      mockUnstableUpdate.mockRejectedValueOnce(new Error("cookie store gone"));
      await PUT(put({ currentPassword: "old123", newPassword: "newPass1" }));
      expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    });

    it("writes nothing when the DB update fails", async () => {
      mockUpdate.mockReturnValueOnce({
        set: () => ({ where: () => Promise.reject(new Error("db down")) }),
      });
      await expectError(
        await PUT(put({ currentPassword: "old123", newPassword: "newPass1" })),
        500,
        "INTERNAL_ERROR",
      );
      expect(mockAuditRequest).not.toHaveBeenCalled();
    });

    it("writes nothing when the current password is wrong", async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      const res = await PUT(
        put({ currentPassword: "wrong", newPassword: "newPass1" }),
      );
      expect(res.status).toBe(403);
      expect(mockAuditRequest).not.toHaveBeenCalled();
    });

    it("writes nothing when validation fails", async () => {
      const res = await PUT(
        put({ currentPassword: "old123", newPassword: "short" }),
      );
      expect(res.status).toBe(400);
      expect(mockAuditRequest).not.toHaveBeenCalled();
    });

    it("writes nothing on invalid JSON", async () => {
      const res = await PUT(
        new Request("http://localhost/api/users/me/password", {
          method: "PUT",
          body: "{not json",
        }),
      );
      await expectError(res, 400, "VALIDATION_ERROR");
      expect(mockAuditRequest).not.toHaveBeenCalled();
    });

    it("writes nothing when the user has no password", async () => {
      mockSelect.mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: "u1", passwordHash: null }]),
          }),
        }),
      });
      const res = await PUT(
        put({ currentPassword: "old123", newPassword: "newPass1" }),
      );
      expect(await expectError(res, 404, "NOT_FOUND")).toBe(
        "User not found or has no password",
      );
      expect(mockAuditRequest).not.toHaveBeenCalled();
    });
  });
});
