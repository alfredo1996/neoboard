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

const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));

const mockUser = {
  id: "u1",
  name: "Alice",
  email: "alice@test.com",
  role: "creator",
  canWrite: true,
  createdAt: new Date("2026-01-01"),
};
const mockSelect = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
});

vi.mock("@/lib/db", () => ({
  db: { select: mockSelect, update: mockUpdate },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "id",
    name: "name",
    email: "email",
    role: "role",
    canWrite: "canWrite",
    createdAt: "createdAt",
  },
}));

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

const put = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/users/me", {
    method: "PUT",
    body,
    headers: { "Content-Type": "application/json", ...headers },
  });

describe("GET /api/users/me", () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([mockUser]) }),
      }),
    });
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns current user profile", async () => {
    const req = new Request("http://localhost/api/users/me");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Alice");
    expect(body.data.email).toBe("alice@test.com");
    expect(body.data.role).toBe("creator");
    expect(body.error).toBeNull();
    expect(body.meta).toBeNull();
  });

  it("answers 404 in the envelope when the user row is gone (#2011)", async () => {
    mockSelect.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const res = await GET(new Request("http://localhost/api/users/me"));
    expect(await expectError(res, 404, "NOT_FOUND")).toBe("User not found");
  });

  it("answers 401 in the envelope without a session (#2011)", async () => {
    requireSession.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new Request("http://localhost/api/users/me"));
    expect(await expectError(res, 401, "UNAUTHORIZED")).toBe("Unauthorized");
  });
});

describe("PUT /api/users/me", () => {
  let PUT: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([mockUser]) }),
      }),
    });
    const mod = await import("../route");
    PUT = mod.PUT;
  });

  it("updates user name", async () => {
    const req = new Request("http://localhost/api/users/me", {
      method: "PUT",
      body: JSON.stringify({ name: "Bob" }),
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

  it("returns 400 VALIDATION_ERROR when name is empty", async () => {
    const res = await PUT(put(JSON.stringify({ name: "" })));
    expect(await expectError(res, 400, "VALIDATION_ERROR")).toBe(
      "Name is required",
    );
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("answers 413 for a body larger than the proxy passes on (#2011)", async () => {
    const res = await PUT(
      put(JSON.stringify({ name: "Bob" }), {
        "content-length": String(11 * 1024 * 1024),
      }),
    );
    await expectError(res, 413, "PAYLOAD_TOO_LARGE");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("answers 401 in the envelope without a session (#2011)", async () => {
    requireSession.mockRejectedValueOnce(new UnauthorizedError());
    const res = await PUT(put(JSON.stringify({ name: "Bob" })));
    await expectError(res, 401, "UNAUTHORIZED");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("records a user.profile.update entry with the changed fields (#1276)", async () => {
    const req = new Request("http://localhost/api/users/me", {
      method: "PUT",
      body: JSON.stringify({
        name: "Bob",
        tenantId: "evil-tenant",
        userId: "evil-user",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [auditedReq, entry] = mockAuditRequest.mock.calls[0];
    expect(auditedReq).toBe(req);
    // tenantId/userId come from the session, never the body.
    expect(entry).toEqual({
      action: "user.profile.update",
      resourceType: "user",
      resourceId: "u1",
      tenantId: "default",
      userId: "u1",
      details: { fields: ["name"] },
    });
  });

  it("writes nothing when the DB update fails (#1276)", async () => {
    mockUpdate.mockReturnValueOnce({
      set: () => ({ where: () => Promise.reject(new Error("db down")) }),
    });
    const req = new Request("http://localhost/api/users/me", {
      method: "PUT",
      body: JSON.stringify({ name: "Bob" }),
      headers: { "Content-Type": "application/json" },
    });
    await expectError(await PUT(req), 500, "INTERNAL_ERROR");
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("writes nothing on invalid JSON: 400 VALIDATION_ERROR (#1276, #2011)", async () => {
    const res = await PUT(put("{not json"));
    await expectError(res, 400, "VALIDATION_ERROR");
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });
});
