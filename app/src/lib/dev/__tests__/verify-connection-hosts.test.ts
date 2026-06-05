import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractHostname,
  verifyConnectionHostsImpl,
} from "../verify-connection-hosts";

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
  let warn: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    warn = vi.fn();
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
    expect(msg).not.toContain('"PG"'); // resolvable, not listed
    expect(msg).toMatch(/seed-demo\.mjs/);
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
