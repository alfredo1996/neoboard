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
  let GET: () => Promise<any>;

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
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Forbidden"));
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("includes canWrite field for each user", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    const rows = [
      { id: "u1", name: "Alice", email: "alice@example.com", role: "creator", canWrite: true, createdAt: new Date() },
      { id: "u2", name: "Bob", email: "bob@example.com", role: "creator", canWrite: false, createdAt: new Date() },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(rows));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res._body[0].canWrite).toBe(true);
    expect(res._body[1].canWrite).toBe(false);
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

  it("creates user with canWrite: false when specified", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", tenantId: "default" });
    // No existing user with this email
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
    expect(res._body.canWrite).toBe(false);
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
    expect(res._body.canWrite).toBe(true);
  });
});
