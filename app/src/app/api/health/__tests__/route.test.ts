import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const mockValidate = vi.fn();
const mockDbExecute = vi.fn();

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
});
