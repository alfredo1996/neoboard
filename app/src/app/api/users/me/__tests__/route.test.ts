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
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 400 when name is empty", async () => {
    const req = new Request("http://localhost/api/users/me", {
      method: "PUT",
      body: JSON.stringify({ name: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});
