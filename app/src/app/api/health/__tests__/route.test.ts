import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockValidate = vi.fn();
const mockDbExecute = vi.fn();
const mockRequireSession = vi.fn();
const mockListSchedulers = vi.fn();
const mockProbe = vi.fn();

vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/env-config", () => ({
  validateEnvConfig: mockValidate,
}));
vi.mock("@/lib/db", () => ({
  db: { execute: mockDbExecute },
}));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray) => strings[0],
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: mockRequireSession,
}));
vi.mock("@/lib/query/scheduler-registry", () => ({
  listSchedulers: mockListSchedulers,
}));
vi.mock("@/lib/crypto/credential-health", () => ({
  probeCredentialDecryption: mockProbe,
}));

describe("GET /api/health", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue([{ "?column?": 1 }]);
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.doMock("@/lib/env-config", () => ({
      validateEnvConfig: mockValidate,
    }));
    vi.doMock("@/lib/db", () => ({
      db: { execute: mockDbExecute },
    }));
    vi.doMock("drizzle-orm", () => ({
      sql: (strings: TemplateStringsArray) => strings[0],
    }));
    vi.doMock("@/lib/auth/session", () => ({
      requireSession: mockRequireSession,
    }));
    vi.doMock("@/lib/query/scheduler-registry", () => ({
      listSchedulers: mockListSchedulers,
    }));
    vi.doMock("@/lib/crypto/credential-health", () => ({
      probeCredentialDecryption: mockProbe,
    }));
    mockRequireSession.mockRejectedValue(new Error("unauthenticated"));
    mockListSchedulers.mockReturnValue([]);
    mockProbe.mockResolvedValue("ok");
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 200 with ok status when config is valid", async () => {
    mockValidate.mockReturnValue({
      status: "ok",
      errors: [],
      warnings: [],
      config: { DATABASE_URL: "set" },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("ok");
    expect(body.data.config).toBeDefined();
  });

  it("returns 200 with degraded status when warnings exist", async () => {
    mockValidate.mockReturnValue({
      status: "degraded",
      errors: [],
      warnings: [{ key: "OIDC_CLIENT_ID", level: "warning", message: "..." }],
      config: { DATABASE_URL: "set", OIDC_CLIENT_ID: "unset" },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("degraded");
    expect(body.data.warnings).toHaveLength(1);
  });

  it("returns 503 when required vars are missing", async () => {
    mockValidate.mockReturnValue({
      status: "error",
      errors: [{ key: "DATABASE_URL", level: "error", message: "..." }],
      warnings: [],
      config: { DATABASE_URL: "unset" },
    });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.data.status).toBe("error");
    expect(body.data.errors).toHaveLength(1);
  });

  it("never exposes actual env var values", async () => {
    mockValidate.mockReturnValue({
      status: "ok",
      errors: [],
      warnings: [],
      config: { DATABASE_URL: "set", ENCRYPTION_KEY: "set" },
    });
    const res = await GET();
    const body = await res.json();
    const configValues = Object.values(body.data.config);
    for (const val of configValues) {
      expect(val).toMatch(/^(set|unset)$/);
    }
  });

  it("includes db status when database is reachable", async () => {
    mockValidate.mockReturnValue({
      status: "ok",
      errors: [],
      warnings: [],
      config: { DATABASE_URL: "set" },
    });
    mockDbExecute.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.db.status).toBe("ok");
    expect(typeof body.data.db.latencyMs).toBe("number");
    expect(body.data.db.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns 503 when database is unreachable", async () => {
    mockValidate.mockReturnValue({
      status: "ok",
      errors: [],
      warnings: [],
      config: { DATABASE_URL: "set" },
    });
    mockDbExecute.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.data.db.status).toBe("error");
    expect(body.data.status).toBe("error");
  });

  it("returns 503 when env config errors exist regardless of DB status", async () => {
    mockValidate.mockReturnValue({
      status: "error",
      errors: [{ key: "ENCRYPTION_KEY", level: "error", message: "missing" }],
      warnings: [],
      config: { ENCRYPTION_KEY: "unset" },
    });
    mockDbExecute.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  // #930 — extended payload: version / migrations / schedulers, admin-gated.
  describe("extended payload (#930)", () => {
    const okConfig = {
      status: "ok",
      errors: [],
      warnings: [],
      config: {},
    };

    it("omits version/migrations/schedulers for unauthenticated probes", async () => {
      mockValidate.mockReturnValue(okConfig);
      const res = await GET();
      const body = await res.json();
      expect(body.data.version).toBeUndefined();
      expect(body.data.migrations).toBeUndefined();
      expect(body.data.schedulers).toBeUndefined();
    });

    it("includes version, migrations and scheduler stats for admins", async () => {
      mockValidate.mockReturnValue(okConfig);
      mockRequireSession.mockResolvedValue({ userId: "u1", role: "admin" });
      mockDbExecute.mockResolvedValue([
        { applied: 1, last_applied_at: 1751400000000 },
      ]);
      mockListSchedulers.mockReturnValue([
        {
          connectionId: "conn-1",
          scheduler: {
            getStats: () => ({ queueDepth: 2, activeQueries: 1 }),
          },
        },
      ]);

      const res = await GET();
      const body = await res.json();
      expect(typeof body.data.version.app).toBe("string");
      expect(body.data.migrations.applied).toBe(1);
      expect(body.data.schedulers).toEqual([
        { connectionId: "conn-1", queueDepth: 2, activeQueries: 1 },
      ]);
    });

    it("does not extend the payload for non-admin sessions", async () => {
      mockValidate.mockReturnValue(okConfig);
      mockRequireSession.mockResolvedValue({ userId: "u2", role: "creator" });
      const res = await GET();
      const body = await res.json();
      expect(body.data.version).toBeUndefined();
      expect(body.data.schedulers).toBeUndefined();
    });

    // Everything checks the key's SHAPE; nothing checked it was the RIGHT key,
    // so a mismatched instance passed health and then failed on every widget
    // (#1274). Admin-only: "this instance cannot decrypt its own secrets" is a
    // gift to an attacker.
    describe("credential decryption status (#1274)", () => {
      it("reports ok to an admin when a stored credential decrypts", async () => {
        mockValidate.mockReturnValue(okConfig);
        mockRequireSession.mockResolvedValue({ userId: "u1", role: "admin" });
        mockDbExecute.mockResolvedValue([{ applied: 1, last_applied_at: 1 }]);
        mockListSchedulers.mockReturnValue([]);
        mockProbe.mockResolvedValue("ok");

        const body = await (await GET()).json();
        expect(body.data.credentials).toEqual({ decryption: "ok" });
      });

      it("reports the mismatch without turning health into a 503", async () => {
        // The app is up; its secrets are unreadable. Those are different
        // alarms, and conflating them takes the instance out of a load
        // balancer for a problem no restart fixes.
        mockValidate.mockReturnValue(okConfig);
        mockRequireSession.mockResolvedValue({ userId: "u1", role: "admin" });
        mockDbExecute.mockResolvedValue([{ applied: 1, last_applied_at: 1 }]);
        mockListSchedulers.mockReturnValue([]);
        mockProbe.mockResolvedValue("mismatch");

        const res = await GET();
        const body = await res.json();
        expect(body.data.credentials).toEqual({ decryption: "mismatch" });
        expect(res.status).toBe(200);
        expect(body.data.status).not.toBe("error");
      });

      it("hides it from unauthenticated probes", async () => {
        mockValidate.mockReturnValue(okConfig);
        mockProbe.mockResolvedValue("mismatch");
        const body = await (await GET()).json();
        expect(body.data.credentials).toBeUndefined();
      });

      it("hides it from non-admin sessions", async () => {
        mockValidate.mockReturnValue(okConfig);
        mockRequireSession.mockResolvedValue({ userId: "u2", role: "creator" });
        mockProbe.mockResolvedValue("mismatch");
        const body = await (await GET()).json();
        expect(body.data.credentials).toBeUndefined();
      });

      it("degrades to unknown rather than throwing when the probe fails", async () => {
        // Health must never fail on a diagnostic. A probe that throws would
        // take down the endpoint an operator uses to find out why.
        mockValidate.mockReturnValue(okConfig);
        mockRequireSession.mockResolvedValue({ userId: "u1", role: "admin" });
        mockDbExecute.mockResolvedValue([{ applied: 1, last_applied_at: 1 }]);
        mockListSchedulers.mockReturnValue([]);
        mockProbe.mockRejectedValue(new Error("boom"));

        const res = await GET();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.data.credentials).toEqual({ decryption: "unknown" });
      });
    });
  });
});
