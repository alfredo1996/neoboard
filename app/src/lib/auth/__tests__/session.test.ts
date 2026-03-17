import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
const mockResolveApiKeyAuth = vi.fn();

vi.mock("../config", () => ({
  auth: mockAuth,
}));

vi.mock("../api-key", () => ({
  resolveApiKeyAuth: mockResolveApiKeyAuth,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("requireUserId", () => {
  let requireUserId: () => Promise<string>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: no API key header (session auth path)
    mockResolveApiKeyAuth.mockResolvedValue(null);
    vi.doMock("../config", () => ({ auth: mockAuth }));
    vi.doMock("../api-key", () => ({ resolveApiKeyAuth: mockResolveApiKeyAuth }));
    const mod = await import("../session");
    requireUserId = mod.requireUserId;
  });

  it("returns userId when session is valid", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const id = await requireUserId();
    expect(id).toBe("user-1");
  });

  it("throws when session is null", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue(null);
    await expect(requireUserId()).rejects.toThrow("Unauthorized");
  });

  it("throws when user.id is missing", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ user: {} });
    await expect(requireUserId()).rejects.toThrow("Unauthorized");
  });

  it("returns userId from API key auth when header is present", async () => {
    mockResolveApiKeyAuth.mockResolvedValue({
      userId: "api-user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const id = await requireUserId();
    expect(id).toBe("api-user-1");
    expect(mockAuth).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  let requireAdmin: () => Promise<{ userId: string; tenantId: string }>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: no API key header (session auth path)
    mockResolveApiKeyAuth.mockResolvedValue(null);
    vi.doMock("../config", () => ({ auth: mockAuth }));
    vi.doMock("../api-key", () => ({ resolveApiKeyAuth: mockResolveApiKeyAuth }));
    const mod = await import("../session");
    requireAdmin = mod.requireAdmin;
  });

  it("returns userId and tenantId when caller is admin", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "admin", tenantId: "tenant-x" },
    });
    const result = await requireAdmin();
    expect(result.userId).toBe("admin-1");
    expect(result.tenantId).toBe("tenant-x");
  });

  it("throws Forbidden when caller is creator", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "creator", tenantId: "t1" },
    });
    await expect(requireAdmin()).rejects.toThrow("Forbidden");
  });

  it("throws Forbidden when caller is reader", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue({
      user: { id: "user-2", role: "reader", tenantId: "t1" },
    });
    await expect(requireAdmin()).rejects.toThrow("Forbidden");
  });

  it("throws Unauthorized when session is null", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
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
    // Default: no API key header (session auth path)
    mockResolveApiKeyAuth.mockResolvedValue(null);
    vi.doMock("../config", () => ({ auth: mockAuth }));
    vi.doMock("../api-key", () => ({ resolveApiKeyAuth: mockResolveApiKeyAuth }));
    const mod = await import("../session");
    requireSession = mod.requireSession;
  });

  it("throws when session is null", async () => {
    mockResolveApiKeyAuth.mockResolvedValue(null);
    mockAuth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("Unauthorized");
  });

  it("returns user context from API key auth when header is present", async () => {
    mockResolveApiKeyAuth.mockResolvedValue({
      userId: "api-user-2",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const result = await requireSession();
    expect(result).toMatchObject({
      userId: "api-user-2",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    expect(mockAuth).not.toHaveBeenCalled();
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

  it("returns canWrite=false for creator when session.user.canWrite is false", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "creator", tenantId: "t1", canWrite: false },
    });
    const session = await requireSession();
    expect(session.canWrite).toBe(false);
  });

  it("returns canWrite=false for reader even when session.user.canWrite is true", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-2", role: "reader", tenantId: "t1", canWrite: true },
    });
    const session = await requireSession();
    expect(session.canWrite).toBe(false);
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

  it("defaults canWrite to true for creator when session.user.canWrite is missing (old token)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-3", role: "creator", tenantId: "t1" },
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
