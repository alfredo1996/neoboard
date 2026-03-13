import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeInsertChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin = vi.fn<() => Promise<{ userId: string; tenantId: string }>>();
const mockBcryptHash = vi.fn(async (pw: string) => `hashed:${pw}`);

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/users", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeRequest({}, "http://localhost/api/users"));
    expect(res.status).toBe(401);
    expect(res._body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when caller is not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Forbidden"));
    const res = await GET(makeRequest({}, "http://localhost/api/users"));
    expect(res.status).toBe(403);
    expect(res._body.error.code).toBe("FORBIDDEN");
  });

  it("returns users in envelope with pagination meta", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    const rows = [
      { id: "u1", name: "Alice", email: "alice@example.com", role: "creator", canWrite: true, createdAt: new Date() },
      { id: "u2", name: "Bob", email: "bob@example.com", role: "creator", canWrite: false, createdAt: new Date() },
    ];
    // Count query
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 2 }]));
    // Data query
    mockDb.select.mockReturnValueOnce(makeSelectChain(rows));

    const res = await GET(makeRequest({}, "http://localhost/api/users"));
    expect(res.status).toBe(200);
    expect(res._body.data).toHaveLength(2);
    expect(res._body.data[0].canWrite).toBe(true);
    expect(res._body.data[1].canWrite).toBe(false);
    expect(res._body.error).toBeNull();
    expect(res._body.meta).toEqual({ total: 2, limit: 25, offset: 0 });
  });

  it("respects limit and offset query params", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 10 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([
      { id: "u3", name: "Charlie", email: "charlie@example.com", role: "reader", canWrite: false, createdAt: new Date() },
    ]));

    const res = await GET(makeRequest({}, "http://localhost/api/users?limit=1&offset=2"));
    expect(res.status).toBe(200);
    expect(res._body.data).toHaveLength(1);
    expect(res._body.meta).toEqual({ total: 10, limit: 1, offset: 2 });
  });
});

describe("POST /api/users", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("creates user and returns 201 envelope", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const created = { id: "u1", name: "Test", email: "test@example.com", role: "creator", canWrite: false, createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({
      name: "Test",
      email: "test@example.com",
      password: "password123",
      role: "creator",
      canWrite: false,
    }));

    expect(res.status).toBe(201);
    expect(res._body.data.canWrite).toBe(false);
    expect(res._body.data.id).toBe("u1");
    expect(res._body.error).toBeNull();
  });

  it("defaults canWrite to true when omitted", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const created = { id: "u2", name: "Alice", email: "alice@example.com", role: "creator", canWrite: true, createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({
      name: "Alice",
      email: "alice@example.com",
      password: "password123",
    }));

    expect(res.status).toBe(201);
    expect(res._body.data.canWrite).toBe(true);
  });

  it("returns 409 envelope when email already exists", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "existing" }]));

    const res = await POST(makeRequest({
      name: "Dup",
      email: "dup@example.com",
      password: "password123",
    }));

    expect(res.status).toBe(409);
    expect(res._body.error.code).toBe("CONFLICT");
    expect(res._body.error.message).toMatch(/already exists/i);
  });

  it("returns 400 envelope for invalid body", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });

    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(400);
    expect(res._body.error.code).toBe("VALIDATION_ERROR");
  });
});
