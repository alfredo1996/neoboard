import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
  makeDeleteChain,
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

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ encrypt: mockEncrypt }));
vi.mock("next/server", () => nextResponseMockFactory());

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
    const mod = await import("../route");
    GET = mod.GET;
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
    // Simulate existing provider with same issuer
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "existing-1" }]));
    const res = await POST(makeRequest(validProvider));
    expect(res.status).toBe(409);
  });

  it("returns 409 when max providers (5) reached", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // First select: no duplicate issuer
    const noDuplicate = makeSelectChain([]);
    // Second select: 5 existing providers
    const fiveProviders = makeSelectChain([
      { id: "1" },
      { id: "2" },
      { id: "3" },
      { id: "4" },
      { id: "5" },
    ]);
    mockDb.select
      .mockReturnValueOnce(noDuplicate)
      .mockReturnValueOnce(fiveProviders);
    const res = await POST(makeRequest(validProvider));
    expect(res.status).toBe(409);
  });

  it("encrypts client secret before storing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_SESSION);
    // No duplicate issuer
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([])); // count check

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
  });
});
