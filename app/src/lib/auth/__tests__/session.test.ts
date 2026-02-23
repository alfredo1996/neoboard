import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();

vi.mock("../config", () => ({
  auth: mockAuth,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requireUserId", () => {
  let requireUserId: () => Promise<string>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-mock after resetModules
    vi.doMock("../config", () => ({ auth: mockAuth }));
    const mod = await import("../session");
    requireUserId = mod.requireUserId;
  });

  it("returns userId when session is valid", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const id = await requireUserId();
    expect(id).toBe("user-1");
  });

  it("throws when session is null", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireUserId()).rejects.toThrow("Unauthorized");
  });

  it("throws when user.id is missing", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    await expect(requireUserId()).rejects.toThrow("Unauthorized");
  });
});

describe("requireAdmin", () => {
  let requireAdmin: () => Promise<{ userId: string; tenantId: string }>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("../config", () => ({ auth: mockAuth }));
    const mod = await import("../session");
    requireAdmin = mod.requireAdmin;
  });

  it("returns userId and tenantId when caller is admin", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "admin", tenantId: "tenant-x" },
    });
    const result = await requireAdmin();
    expect(result.userId).toBe("admin-1");
    expect(result.tenantId).toBe("tenant-x");
  });

  it("throws Forbidden when caller is creator", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "creator", tenantId: "t1" },
    });
    await expect(requireAdmin()).rejects.toThrow("Forbidden");
  });

  it("throws Forbidden when caller is reader", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-2", role: "reader", tenantId: "t1" },
    });
    await expect(requireAdmin()).rejects.toThrow("Forbidden");
  });

  it("throws Unauthorized when session is null", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("Unauthorized");
  });
});

describe("requireSession", () => {
  let requireSession: () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  }>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("../config", () => ({ auth: mockAuth }));
    const mod = await import("../session");
    requireSession = mod.requireSession;
  });

  it("throws when session is null", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("Unauthorized");
  });

  it("returns session with creator role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "creator", tenantId: "tenant-abc" },
    });
    const session = await requireSession();
    expect(session.userId).toBe("user-1");
    expect(session.role).toBe("creator");
    expect(session.canWrite).toBe(true);
    expect(session.tenantId).toBe("tenant-abc");
  });

  it("returns canWrite=false for reader role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-2", role: "reader", tenantId: "t1" },
    });
    const session = await requireSession();
    expect(session.canWrite).toBe(false);
  });

  it("returns canWrite=true for admin role", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "admin", tenantId: "t1" },
    });
    const session = await requireSession();
    expect(session.canWrite).toBe(true);
  });

  it("defaults role to creator when role is missing", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-3", tenantId: "t1" },
    });
    const session = await requireSession();
    expect(session.role).toBe("creator");
  });

  it("falls back to TENANT_ID env var when tenantId not in session", async () => {
    process.env.TENANT_ID = "env-tenant";
    mockAuth.mockResolvedValue({
      user: { id: "user-4", role: "creator" },
    });
    const session = await requireSession();
    expect(session.tenantId).toBe("env-tenant");
    delete process.env.TENANT_ID;
  });

  it("falls back to 'default' when neither session nor env tenantId is set", async () => {
    const savedTenantId = process.env.TENANT_ID;
    delete process.env.TENANT_ID;
    mockAuth.mockResolvedValue({
      user: { id: "user-5", role: "creator" },
    });
    const session = await requireSession();
    expect(session.tenantId).toBe("default");
    if (savedTenantId !== undefined) process.env.TENANT_ID = savedTenantId;
  });
});
