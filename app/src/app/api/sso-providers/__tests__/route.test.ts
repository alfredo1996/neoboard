import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
  makeDeleteChain,
  makeUpdateChain,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin =
  vi.fn<() => Promise<{ userId: string; tenantId: string; role: string }>>();
const mockEncrypt = vi.fn((s: string) => `encrypted:${s}`);

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
};
const mockInvalidateCache = vi.fn();

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

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/sso/provider-cache", () => ({
  invalidateProviderCache: mockInvalidateCache,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_SESSION = {
  userId: "admin-1",
  tenantId: "default",
  role: "admin",
  canWrite: true,
};

const validProvider = {
  name: "Company SSO",
  issuer: "https://idp.example.com",
  clientId: "client-123",
  clientSecret: "secret-456",
  scopes: "openid profile email",
};

// ---------------------------------------------------------------------------
// Tests — GET /api/sso-providers
// ---------------------------------------------------------------------------

describe("GET /api/sso-providers", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireAdmin: mockRequireAdmin,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.doMock("@/lib/auth/sso/provider-cache", () => ({
      invalidateProviderCache: mockInvalidateCache,
    }));
    vi.stubEnv("NEOBOARD_EDITION", "enterprise");
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 403 when NEOBOARD_EDITION is not enterprise", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "");
    // Re-import to pick up the env change
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({
      requireAdmin: mockRequireAdmin,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.doMock("@/lib/auth/sso/provider-cache", () => ({
      invalidateProviderCache: mockInvalidateCache,
    }));
    const mod = await import("../route");
    const res = await mod.GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/enterprise/i);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError());
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(403);
  });

  it("returns empty array when no providers configured", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns providers without client secrets", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const rows = [
      {
        id: "sso-1",
        name: "Company SSO",
        protocol: "oidc",
        issuer: "https://idp.example.com",
        clientId: "client-123",
        scopes: "openid profile email",
        claimMappings: null,
        autoProvision: true,
        defaultRole: "creator",
        enforceSso: false,
        enabled: true,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(rows));
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty("clientSecretEncrypted");
    expect(body.data[0].name).toBe("Company SSO");
  });
});

// ---------------------------------------------------------------------------
// Tests — POST /api/sso-providers
// ---------------------------------------------------------------------------

describe("POST /api/sso-providers", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireAdmin: mockRequireAdmin,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await POST(makeRequest(validProvider));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ ...validProvider, name: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when issuer is not a valid URL", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(
      makeRequest({ ...validProvider, issuer: "not-a-url" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when clientId is missing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(
      makeRequest({ ...validProvider, clientId: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when clientSecret is missing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(
      makeRequest({ ...validProvider, clientSecret: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when duplicate issuer for tenant", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // Count check passes (under limit)
    mockDb.select.mockReturnValue(makeSelectChain([]));
    // Insert fails with unique constraint violation
    mockDb.insert.mockReturnValue({
      values: () => ({
        returning: () =>
          Promise.reject(
            new Error(
              'duplicate key value violates unique constraint "sso_provider_tenant_issuer_unique"',
            ),
          ),
      }),
    });
    const res = await POST(makeRequest(validProvider));
    expect(res.status).toBe(409);
  });

  it("returns 409 when max providers (5) reached", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // Count check: 5 existing providers (at limit)
    mockDb.select.mockReturnValue(
      makeSelectChain([
        { id: "1" },
        { id: "2" },
        { id: "3" },
        { id: "4" },
        { id: "5" },
      ]),
    );
    const res = await POST(makeRequest(validProvider));
    expect(res.status).toBe(409);
  });

  it("encrypts client secret before storing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // Count check: under limit
    mockDb.select.mockReturnValue(makeSelectChain([]));

    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([
          {
            id: "new-sso",
            name: "Company SSO",
            protocol: "oidc",
            issuer: "https://idp.example.com",
            clientId: "client-123",
            enabled: true,
            createdAt: new Date(),
          },
        ]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    await POST(makeRequest(validProvider));

    expect(capturedValues).not.toBeNull();
    expect(mockEncrypt).toHaveBeenCalledWith("secret-456");
    expect(capturedValues!.clientSecretEncrypted).toBe("encrypted:secret-456");
    // Raw secret must NOT be stored
    expect(capturedValues!).not.toHaveProperty("clientSecret");
  });

  it("returns 201 with created provider on valid request", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const insertedRow = {
      id: "new-sso",
      name: "Company SSO",
      protocol: "oidc",
      issuer: "https://idp.example.com",
      clientId: "client-123",
      scopes: "openid profile email",
      claimMappings: null,
      autoProvision: true,
      defaultRole: "creator",
      enforceSso: false,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([insertedRow]));
    const res = await POST(makeRequest(validProvider));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Company SSO");
    expect(body.data).not.toHaveProperty("clientSecretEncrypted");
  });

  it("stores tenantId from session", async () => {
    mockRequireAdmin.mockResolvedValue({
      ...ADMIN_SESSION,
      tenantId: "tenant-x",
    });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([{ id: "sso-1", name: "SSO", createdAt: new Date() }]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    await POST(makeRequest(validProvider));
    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.tenantId).toBe("tenant-x");
  });

  it("accepts optional claim mappings", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([{ id: "sso-1", name: "SSO", createdAt: new Date() }]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    const claimMappings = {
      claimKey: "groups",
      adminValue: "neoboard-admins",
      creatorValue: "neoboard-editors",
      readerValue: "neoboard-viewers",
    };

    await POST(makeRequest({ ...validProvider, claimMappings }));
    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.claimMappings).toEqual(claimMappings);
  });
});

// ---------------------------------------------------------------------------
// Tests — DELETE /api/sso-providers
// ---------------------------------------------------------------------------

describe("DELETE /api/sso-providers", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DELETE: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireAdmin: mockRequireAdmin,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.doMock("@/lib/auth/sso/provider-cache", () => ({
      invalidateProviderCache: mockInvalidateCache,
    }));
    vi.stubEnv("NEOBOARD_EDITION", "enterprise");
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE(
      makeRequest(null, "http://localhost/api/sso-providers?id=sso-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await DELETE(
      makeRequest(null, "http://localhost/api/sso-providers"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when provider not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE(
      makeRequest(null, "http://localhost/api/sso-providers?id=nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 when provider deleted successfully", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.delete.mockReturnValue(
      makeDeleteChain([{ id: "sso-1", name: "Company SSO" }]),
    );
    const res = await DELETE(
      makeRequest(null, "http://localhost/api/sso-providers?id=sso-1"),
    );
    expect(res.status).toBe(200);
    expect(mockInvalidateCache).toHaveBeenCalledWith("default");
  });
});

// ---------------------------------------------------------------------------
// Tests — PATCH /api/sso-providers
// ---------------------------------------------------------------------------

describe("PATCH /api/sso-providers", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PATCH: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireAdmin: mockRequireAdmin,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.doMock("@/lib/auth/sso/provider-cache", () => ({
      invalidateProviderCache: mockInvalidateCache,
    }));
    const mod = await import("../route");
    PATCH = mod.PATCH;
  });

  it("returns 403 for non-admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError());
    const res = await PATCH(makeRequest({ id: "sso-1", name: "Updated" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    const res = await PATCH(makeRequest({ name: "Updated" }));
    expect(res.status).toBe(400);
  });

  it("updates provider and invalidates cache", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.update.mockReturnValue(
      makeUpdateChain([
        {
          id: "sso-1",
          name: "Updated SSO",
          issuer: "https://idp.example.com",
          enabled: true,
        },
      ]),
    );
    const res = await PATCH(
      makeRequest({ id: "sso-1", name: "Updated SSO", enforceSso: true }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated SSO");
    expect(mockInvalidateCache).toHaveBeenCalledWith("default");
  });

  it("encrypts clientSecret when provided", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ id: "sso-1", name: "SSO" }]),
    );
    await PATCH(makeRequest({ id: "sso-1", clientSecret: "new-secret-789" }));
    expect(mockEncrypt).toHaveBeenCalledWith("new-secret-789");
  });

  it("returns 404 when provider not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await PATCH(makeRequest({ id: "nonexistent", name: "Nope" }));
    expect(res.status).toBe(404);
  });
});
