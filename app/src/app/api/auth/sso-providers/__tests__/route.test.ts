import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeSelectChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {
  select: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests — GET /api/auth/sso-providers (public, no auth required)
// ---------------------------------------------------------------------------

const authReq = () =>
  new Request("http://localhost/api/auth", {
    headers: { "x-forwarded-for": "test-ip-" + Math.random() },
  });

describe("GET /api/auth/sso-providers", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    // Default tests assume enterprise (so DB path runs); community tests
    // override before importing the route.
    vi.stubEnv("NEOBOARD_EDITION", "enterprise");
    const mod = await import("../route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty array when no providers configured", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET(authReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns only id and name of enabled providers", async () => {
    const rows = [
      { id: "sso-1", name: "Company SSO" },
      { id: "sso-2", name: "Google Workspace" },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(rows));
    const res = await GET(authReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ id: "sso-1", name: "Company SSO" });
    // Must not leak secrets or internal config
    expect(body.data[0]).not.toHaveProperty("clientId");
    expect(body.data[0]).not.toHaveProperty("clientSecretEncrypted");
    expect(body.data[0]).not.toHaveProperty("issuer");
  });

  it("lists only enabled providers of the configured tenant", async () => {
    // Public route: there is no session, so the tenant comes from the
    // deployment env, never from the request (#1607).
    vi.stubEnv("TENANT_ID", "tenant-x");
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    await GET(authReq());
    expect(chain.calls.where).toHaveLength(1);
    const [expr] = chain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["tenant_id", "enabled"]),
    );
    expect(sqlValues(expr)).toEqual(expect.arrayContaining(["tenant-x", true]));
  });

  it("does not require authentication", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    // If this handler required auth, it would throw — it should not
    const res = await GET(authReq());
    expect(res.status).toBe(200);
  });

  it("returns empty array on community edition even when DB has rows", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "");
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    // Stub: even if DB has rows, community should not query/return them
    mockDb.select.mockReturnValue(
      makeSelectChain([
        { id: "sso-1", name: "Stale Provider", enforceSso: false },
      ]),
    );
    const mod = await import("../route");
    const res = await mod.GET(authReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta?.enforceSso).toBe(false);
    // Critical: community must not even hit the DB (defense in depth)
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns rows on enterprise edition", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "enterprise");
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    mockDb.select.mockReturnValue(
      makeSelectChain([{ id: "sso-1", name: "Okta", enforceSso: false }]),
    );
    const mod = await import("../route");
    const res = await mod.GET(authReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: "sso-1", name: "Okta" }]);
  });
});
