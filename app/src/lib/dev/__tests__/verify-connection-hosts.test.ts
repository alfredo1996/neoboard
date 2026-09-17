import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractHostname,
  verifyConnectionHosts,
  verifyConnectionHostsImpl,
} from "../verify-connection-hosts";

// Hoisted module mocks, not a per-test doMock (#1859). verifyConnectionHosts
// loads its dependencies with five concurrent dynamic imports. A mock registered
// inside the test is resolved asynchronously, and under CI load drizzle-orm
// sometimes loaded before its mock: the real `eq` ran, the query still scoped to
// "default", but the assertion received a drizzle SQL object. vi.mock is hoisted
// above every import, so there is no window to race. Nothing else in this file
// touches these modules.
const where = vi.hoisted(() => vi.fn(async (_condition: unknown) => []));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where }) }) },
}));
vi.mock("@/lib/db/schema", () => ({
  connections: {
    name: "name",
    type: "type",
    configEncrypted: "c",
    tenantId: "tenant_id",
  },
}));
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, v: string) => ({ column, value: v }),
}));

// ---------------------------------------------------------------------------
// verifyConnectionHosts — the tenant it scopes its diagnostic query to
// ---------------------------------------------------------------------------

describe("verifyConnectionHosts tenant (#1728)", () => {
  beforeEach(() => {
    where.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, "default"],
    ["", "default"],
    ["   ", "default"],
    ["acme", "acme"],
  ])("TENANT_ID=%j scopes the query to tenant %j", async (value, tenant) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TENANT_ID", value);

    await verifyConnectionHosts();

    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith({ column: "tenant_id", value: tenant });
  });
});

// ---------------------------------------------------------------------------
// extractHostname
// ---------------------------------------------------------------------------

describe("extractHostname", () => {
  it("extracts host from bolt:// URI", () => {
    expect(extractHostname("bolt://neoboard-neo4j:7687")).toBe(
      "neoboard-neo4j",
    );
  });

  it("extracts host from postgresql:// URI", () => {
    expect(extractHostname("postgresql://user@localhost:5432/db")).toBe(
      "localhost",
    );
  });

  it("handles bare hostname without port", () => {
    expect(extractHostname("bolt://example.com")).toBe("example.com");
  });

  it("returns null on malformed URI", () => {
    expect(extractHostname("not a url")).toBe(null);
    expect(extractHostname("")).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// verifyConnectionHostsImpl
// ---------------------------------------------------------------------------

describe("verifyConnectionHostsImpl", () => {
  let warn: ReturnType<typeof vi.fn<(message: string) => void>>;
  beforeEach(() => {
    warn = vi.fn<(message: string) => void>();
  });

  it("does nothing when there are no seeded connections", async () => {
    const result = await verifyConnectionHostsImpl({
      fetchConnections: async () => [],
      resolve: vi.fn(),
      warn,
    });
    expect(result).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn when every host resolves", async () => {
    const result = await verifyConnectionHostsImpl({
      fetchConnections: async () => [
        { name: "Neo4j", type: "neo4j", uri: "bolt://localhost:7687" },
        { name: "PG", type: "postgresql", uri: "postgresql://localhost:5432" },
      ],
      resolve: vi.fn().mockResolvedValue({ address: "127.0.0.1" }),
      warn,
    });
    expect(result).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once per batch listing every unresolvable connection", async () => {
    const result = await verifyConnectionHostsImpl({
      fetchConnections: async () => [
        { name: "Neo4j", type: "neo4j", uri: "bolt://neoboard-neo4j:7687" },
        { name: "PG", type: "postgresql", uri: "postgresql://localhost:5432" },
        {
          name: "PG2",
          type: "postgresql",
          uri: "postgresql://neoboard-postgres:5432",
        },
      ],
      resolve: vi.fn().mockImplementation((host: string) => {
        if (host === "localhost")
          return Promise.resolve({ address: "127.0.0.1" });
        return Promise.reject(new Error("ENOTFOUND"));
      }),
      warn,
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name).sort()).toEqual(["Neo4j", "PG2"]);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain("2 seeded connection(s)");
    expect(msg).toContain('"Neo4j"');
    expect(msg).toContain('"PG2"');
    expect(msg).toContain("host=neoboard-neo4j");
    expect(msg).toContain("host=neoboard-postgres");
    expect(msg).not.toContain('"PG"'); // resolvable, not listed
    expect(msg).toMatch(/seed-demo\.mjs/);
  });

  it("never logs credentials embedded in connection URIs", async () => {
    await verifyConnectionHostsImpl({
      fetchConnections: async () => [
        {
          name: "PG",
          type: "postgresql",
          uri: "postgresql://admin:supersecret@unreachable-host:5432/db",
        },
      ],
      resolve: vi.fn().mockRejectedValue(new Error("ENOTFOUND")),
      warn,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = warn.mock.calls[0][0] as string;
    expect(msg).toContain("host=unreachable-host");
    expect(msg).not.toContain("admin");
    expect(msg).not.toContain("supersecret");
  });

  it("skips entries with malformed URIs (extractHostname returns null)", async () => {
    const result = await verifyConnectionHostsImpl({
      fetchConnections: async () => [
        { name: "Bad", type: "neo4j", uri: "garbage" },
      ],
      resolve: vi.fn(),
      warn,
    });
    expect(result).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns silently when fetchConnections throws (e.g. DB unreachable)", async () => {
    const result = await verifyConnectionHostsImpl({
      fetchConnections: async () => {
        throw new Error("DB connection failed");
      },
      resolve: vi.fn(),
      warn,
    });
    expect(result).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
