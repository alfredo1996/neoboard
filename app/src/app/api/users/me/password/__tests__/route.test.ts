import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSession = {
  userId: "u1",
  role: "creator",
  canWrite: true,
  tenantId: "default",
};
vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn().mockResolvedValue(mockSession),
}));

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

const mockUnstableUpdate = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/auth/config", () => ({
  unstable_update: mockUnstableUpdate,
}));

import bcrypt from "bcryptjs";

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
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when new password is too short", async () => {
    const req = new Request("http://localhost/api/users/me/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword: "old123", newPassword: "short" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
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
    const res = await PUT(req);
    expect(res.status).toBe(403);
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
});
