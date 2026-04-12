import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeUpdateChain,
  makeDeleteChain,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest, makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import type { ConnectionUsage } from "@/lib/db/connection-usage";

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
const mockEncryptJson = vi.fn((v: unknown) => `enc:${JSON.stringify(v)}`);
const mockDecryptJson = vi.fn(() => ({
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "secret",
  database: "neo4j",
  connectionTimeout: 5000,
}));
const mockPrefetchSchema = vi.fn();
// Default: connection is NOT in use. Individual tests override per-scenario.
// The explicit generic is load-bearing — without it, vi.fn's return type is
// inferred from the default literal `dashboards: []`, pinning the array
// element type to `never` and breaking every `.mockResolvedValue(...)` that
// passes a real dashboard row.
const mockGetConnectionUsage = vi.fn<() => Promise<ConnectionUsage>>(
  async () => ({
    widgetCount: 0,
    dashboards: [],
  }),
);

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
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

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({
  encryptJson: mockEncryptJson,
  decryptJson: mockDecryptJson,
}));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  prefetchSchema: mockPrefetchSchema,
}));
vi.mock("@/lib/db/connection-usage", () => ({
  getConnectionUsage: mockGetConnectionUsage,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};
const ADMIN_SESSION = {
  userId: "admin-1",
  role: "admin",
  canWrite: true,
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// GET /api/connections/[id]
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns connection metadata in envelope (owner)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      name: "My DB",
      type: "postgresql",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(conn);
    expect(body.error).toBeNull();
  });

  it("admin can view any connection in tenant", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const conn = {
      id: "c1",
      name: "Other DB",
      type: "neo4j",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // First select (owner check) returns empty
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    // Second select (admin fallback) returns the connection
    mockDb.select.mockReturnValueOnce(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("c1");
  });

  it("returns 404 when not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await GET(makeRequest({}), makeParams("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("does not expose configEncrypted", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      name: "DB",
      type: "neo4j",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    const body = await res.json();
    expect(body.data.configEncrypted).toBeUndefined();
  });

  it("returns decrypted config without password", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      name: "DB",
      type: "neo4j",
      configEncrypted: "enc:data",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    const body = await res.json();
    expect(body.data.config).toBeDefined();
    expect(body.data.config.uri).toBe("bolt://localhost:7687");
    expect(body.data.config.username).toBe("neo4j");
    expect(body.data.config.database).toBe("neo4j");
    expect(body.data.config.connectionTimeout).toBe(5000);
    expect(body.data.config.password).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/connections/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/connections/[id]", () => {
  let PATCH: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(
      makeRequest({ name: "New name" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await PATCH(
      makeRequest({ name: "New name" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("updates name and returns envelope", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const updated = {
      id: "c1",
      name: "New name",
      type: "neo4j",
      updatedAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(
      makeRequest({ name: "New name" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(updated);
    expect(body.error).toBeNull();
  });

  it("re-encrypts config and triggers prefetch", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const updated = {
      id: "c1",
      name: "Neo4j",
      type: "neo4j",
      updatedAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    await PATCH(
      makeRequest({
        config: {
          uri: "bolt://new-host",
          username: "neo4j",
          password: "newpass",
        },
      }),
      makeParams("c1"),
    );

    expect(mockEncryptJson).toHaveBeenCalledWith({
      uri: "bolt://new-host",
      username: "neo4j",
      password: "newpass",
    });
    expect(mockPrefetchSchema).toHaveBeenCalledWith("neo4j", {
      uri: "bolt://new-host",
      username: "neo4j",
      password: "newpass",
    });
  });

  it("allows config without password (merges with existing)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // First select to fetch existing encrypted config
    const existing = {
      id: "c1",
      configEncrypted: "enc:existing",
      type: "neo4j",
    };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    const updated = {
      id: "c1",
      name: "Neo4j",
      type: "neo4j",
      updatedAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(
      makeRequest({
        config: { uri: "bolt://new-host", username: "neo4j", database: "mydb" },
      }),
      makeParams("c1"),
    );

    expect(res.status).toBe(200);
    // Should merge existing password into new config
    expect(mockEncryptJson).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "bolt://new-host",
        username: "neo4j",
        password: "secret",
      }),
    );
  });

  it("does not call prefetchSchema when password is omitted", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const existing = {
      configEncrypted: "enc:existing",
    };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    const updated = {
      id: "c1",
      name: "Neo4j",
      type: "neo4j",
      updatedAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    await PATCH(
      makeRequest({
        config: { uri: "bolt://new-host", username: "neo4j" },
      }),
      makeParams("c1"),
    );

    // prefetchSchema should still be called because the merged config has a password
    // (merged from existing encrypted config)
    expect(mockPrefetchSchema).toHaveBeenCalled();
  });

  it("handles config without password when no existing config exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // No existing config found
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const updated = {
      id: "c1",
      name: "Neo4j",
      type: "neo4j",
      updatedAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(
      makeRequest({
        config: { uri: "bolt://new-host", username: "neo4j" },
      }),
      makeParams("c1"),
    );

    expect(res.status).toBe(200);
    // Should encrypt the config without the password since there's no existing to merge
    expect(mockEncryptJson).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "bolt://new-host",
        username: "neo4j",
      }),
    );
    // No password in final config — should not call prefetchSchema
    expect(mockPrefetchSchema).not.toHaveBeenCalled();
  });

  it("returns 400 when body fails validation", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await PATCH(
      makeRequest({ config: { uri: "" } }), // uri must be min(1)
      makeParams("c1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("calls prefetchSchema when password is explicitly provided", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const updated = {
      id: "c1",
      name: "PostgreSQL",
      type: "postgresql",
      updatedAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    await PATCH(
      makeRequest({
        config: {
          uri: "postgresql://localhost:5432",
          username: "pg",
          password: "newpass",
        },
      }),
      makeParams("c1"),
    );

    expect(mockPrefetchSchema).toHaveBeenCalledWith("postgresql", {
      uri: "postgresql://localhost:5432",
      username: "pg",
      password: "newpass",
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/connections/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/connections/[id]", () => {
  let DELETE: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  // Helper: Request stub with a URL so `new URL(request.url)` resolves.
  // The route parses `?force=true` from this URL.
  const req = (url = "http://localhost/api/connections/c1") =>
    ({ url }) as unknown as Request;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 0,
      dashboards: [],
    });
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE(req(), makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE(req(), makeParams("c1"));
    expect(res.status).toBe(404);
  });

  it("deletes and returns envelope when no widgets reference the connection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.delete.mockReturnValue(makeDeleteChain([{ id: "c1" }]));
    const res = await DELETE(req(), makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();
  });

  // -------------------------------------------------------------------------
  // #509 — in-use guard
  // -------------------------------------------------------------------------

  it("returns 409 CONFLICT when widgets reference the connection and !force", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 3,
      dashboards: [
        { id: "d1", name: "Sales Overview", widgetCount: 2 },
        { id: "d2", name: "Inventory", widgetCount: 1 },
      ],
    });

    const res = await DELETE(req(), makeParams("c1"));
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/3 widgets.*2 dashboards/);
    expect(body.error.details.usage.widgetCount).toBe(3);
    expect(body.error.details.usage.dashboards).toHaveLength(2);

    // Critically: the delete MUST NOT have been called.
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("pluralizes correctly when exactly 1 widget blocks the delete", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 1,
      dashboards: [{ id: "d1", name: "Dashboard A", widgetCount: 1 }],
    });
    const res = await DELETE(req(), makeParams("c1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe(
      "Connection is in use by 1 widget across 1 dashboard",
    );
  });

  it("?force=true bypasses the guard and deletes the in-use connection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 3,
      dashboards: [{ id: "d1", name: "In-use", widgetCount: 3 }],
    });
    mockDb.delete.mockReturnValue(makeDeleteChain([{ id: "c1" }]));

    const res = await DELETE(
      req("http://localhost/api/connections/c1?force=true"),
      makeParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    // Usage helper is skipped entirely on the force path — no need to
    // compute a breakdown we're about to ignore.
    expect(mockGetConnectionUsage).not.toHaveBeenCalled();
    expect(mockDb.delete).toHaveBeenCalled();
  });

  it("admin delete goes through the in-use guard too", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 2,
      dashboards: [{ id: "d1", name: "Tenant dash", widgetCount: 2 }],
    });

    const res = await DELETE(req(), makeParams("c1"));
    expect(res.status).toBe(409);
    // Admins still need to pass ?force=true to actually delete.
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});
