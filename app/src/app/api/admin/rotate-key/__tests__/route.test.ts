import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  }>
>();

vi.mock("@/lib/auth/session", () => ({
  requireSession: mockRequireSession,
}));

// Mock crypto module — we test the rotation logic at the route level,
// not the actual AES encryption (that's covered by crypto tests).
const mockDecrypt = vi.fn<(s: string) => string>();
const mockEncrypt = vi.fn<(s: string) => string>();

vi.mock("@/lib/crypto/crypto", () => ({
  decrypt: (s: string) => mockDecrypt(s),
  encrypt: (s: string) => mockEncrypt(s),
}));

// Build mock Drizzle chains
function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const c = Object.assign(resolved, {
    from: () => c,
    where: () => c,
  });
  return c;
}

function makeUpdateChain() {
  const c = {
    set: () => c,
    where: () => Promise.resolve(),
  };
  return c;
}

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
};

// vi.hoisted: vi.mock factories are hoisted above top-level consts, so the
// mock must be created in the hoisted scope to stay safe if a future refactor
// switches this file to a static import of the route.
const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));

/** Minimal request — the route only forwards it to auditRequest. */
function makeRotateRequest(): Request {
  return {
    headers: new Headers(),
    url: "http://localhost/api/admin/rotate-key",
  } as unknown as Request;
}

vi.mock("@/lib/db", () => ({ db: mockDb }));

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/rotate-key", () => {
  const originalOldKey = process.env.ENCRYPTION_KEY_OLD;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-mock after resetModules
    vi.doMock("@/lib/auth/session", () => ({
      requireSession: mockRequireSession,
    }));
    vi.doMock("@/lib/crypto/crypto", () => ({
      decrypt: (s: string) => mockDecrypt(s),
      encrypt: (s: string) => mockEncrypt(s),
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    // Audit is mocked so route assertions aren't polluted by its own db.insert.
    vi.doMock("@/lib/audit/audit", () => ({
      auditRequest: mockAuditRequest,
      auditLog: vi.fn(),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: ResponseInit) => ({
          _body: body,
          status: init?.status ?? 200,
          json: async () => body,
        }),
      },
    }));

    const mod = await import("../route");
    POST = mod.POST;
  });

  afterEach(() => {
    if (originalOldKey !== undefined) {
      process.env.ENCRYPTION_KEY_OLD = originalOldKey;
    } else {
      delete process.env.ENCRYPTION_KEY_OLD;
    }
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRotateRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const res = await POST(makeRotateRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when ENCRYPTION_KEY_OLD is not set", async () => {
    delete process.env.ENCRYPTION_KEY_OLD;
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });
    const res = await POST(makeRotateRequest());
    expect(res.status).toBe(400);
    expect(res._body.error.message).toContain("ENCRYPTION_KEY_OLD");
  });

  it("returns 200 and re-encrypts connections and SSO providers", async () => {
    process.env.ENCRYPTION_KEY_OLD = "a".repeat(64);
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });

    const connectionRows = [
      { id: "conn-1", configEncrypted: "old-cipher-1" },
      { id: "conn-2", configEncrypted: "old-cipher-2" },
    ];
    const ssoRows = [
      { id: "sso-1", clientSecretEncrypted: "old-sso-cipher-1" },
    ];

    // decrypt returns deterministic plaintext
    mockDecrypt.mockImplementation((s: string) => `plain:${s}`);
    // encrypt returns deterministic ciphertext
    mockEncrypt.mockImplementation((s: string) => `new:${s}`);

    // The route uses db.transaction, so simulate it by calling the callback
    // with a mock tx that behaves like db.
    const mockTx = {
      select: vi.fn(),
      update: vi.fn(),
    };

    // First select = connections, second = sso_providers
    mockTx.select
      .mockReturnValueOnce(makeSelectChain(connectionRows))
      .mockReturnValueOnce(makeSelectChain(ssoRows));
    mockTx.update.mockReturnValue(makeUpdateChain());

    mockDb.transaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );

    const res = await POST(makeRotateRequest());
    expect(res.status).toBe(200);
    expect(res._body.data.connections).toBe(2);
    expect(res._body.data.ssoProviders).toBe(1);

    // Verify decrypt was called for each row
    expect(mockDecrypt).toHaveBeenCalledTimes(3);
    // Verify encrypt was called for each row
    expect(mockEncrypt).toHaveBeenCalledTimes(3);
    // Verify update was called for each row
    expect(mockTx.update).toHaveBeenCalledTimes(3);
  });

  it("records an admin.key.rotate audit entry with no key material (#1234)", async () => {
    process.env.ENCRYPTION_KEY_OLD = "c".repeat(64);
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });

    const mockTx = { select: vi.fn(), update: vi.fn() };
    mockTx.select
      .mockReturnValueOnce(
        makeSelectChain([{ id: "conn-1", configEncrypted: "old-cipher-1" }]),
      )
      .mockReturnValueOnce(
        makeSelectChain([{ id: "sso-1", clientSecretEncrypted: "old-sso-1" }]),
      );
    mockTx.update.mockReturnValue(makeUpdateChain());
    mockDecrypt.mockImplementation((s: string) => `plain:${s}`);
    mockEncrypt.mockImplementation((s: string) => `new:${s}`);
    mockDb.transaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );

    await POST(makeRotateRequest());

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "admin.key.rotate",
      resourceType: "encryption_key",
      tenantId: "default",
      userId: "admin-1",
      details: { connections: 1, ssoProviders: 1 },
    });
    // Neither the keys nor any ciphertext may reach the trail.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("c".repeat(64));
    expect(serialized).not.toContain("cipher");
  });

  it("writes no audit entry when rotation is rejected (#1234)", async () => {
    delete process.env.ENCRYPTION_KEY_OLD;
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });

    const res = await POST(makeRotateRequest());

    expect(res.status).toBe(400);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("returns 200 with zero counts when no records exist", async () => {
    process.env.ENCRYPTION_KEY_OLD = "b".repeat(64);
    mockRequireSession.mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });

    const mockTx = {
      select: vi.fn(),
      update: vi.fn(),
    };

    mockTx.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    mockDb.transaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
    );

    const res = await POST(makeRotateRequest());
    expect(res.status).toBe(200);
    expect(res._body.data.connections).toBe(0);
    expect(res._body.data.ssoProviders).toBe(0);
  });
});
