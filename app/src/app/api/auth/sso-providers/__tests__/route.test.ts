import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain } from "@/__tests__/helpers/drizzle-mocks";
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

describe("GET /api/auth/sso-providers", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns empty array when no providers configured", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET();
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
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ id: "sso-1", name: "Company SSO" });
    // Must not leak secrets or internal config
    expect(body.data[0]).not.toHaveProperty("clientId");
    expect(body.data[0]).not.toHaveProperty("clientSecretEncrypted");
    expect(body.data[0]).not.toHaveProperty("issuer");
  });

  it("does not require authentication", async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]));
    // If this handler required auth, it would throw — it should not
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
