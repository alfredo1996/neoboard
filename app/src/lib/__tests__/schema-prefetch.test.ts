/**
 * schema-prefetch — unit tests for pure logic (node environment, no DOM).
 *
 * Only `buildAuthConfig` is fully unit-testable here because it is a pure
 * function with no external dependencies.
 *
 * `fetchConnectionSchema` and `prefetchSchema` require the compiled
 * connection package modules (Neo4jSchemaManager, PostgresSchemaManager)
 * which are not available in the Vitest node environment. Those code paths
 * are exercised via the Playwright E2E suite.
 */
import { describe, it, expect } from "vitest";
import { buildAuthConfig } from "@/lib/schema-prefetch";
import type { ConnectionCredentials } from "@/lib/query-executor";

const baseCredentials: ConnectionCredentials = {
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "secret",
};

describe("buildAuthConfig", () => {
  it("maps uri, username, and password from credentials", () => {
    const result = buildAuthConfig(baseCredentials);
    expect(result.uri).toBe("bolt://localhost:7687");
    expect(result.username).toBe("neo4j");
    expect(result.password).toBe("secret");
  });

  it("sets authType to 1 (NATIVE)", () => {
    const result = buildAuthConfig(baseCredentials);
    expect(result.authType).toBe(1);
  });

  it("returns uri unchanged when no database is provided", () => {
    const result = buildAuthConfig(baseCredentials);
    expect(result.uri).toBe("bolt://localhost:7687");
  });

  it("embeds database in URI path when database is provided", () => {
    const creds: ConnectionCredentials = {
      ...baseCredentials,
      database: "mydb",
    };
    const result = buildAuthConfig(creds);
    expect(result.uri).toContain("mydb");
  });

  it("does not embed database when URI already has a path", () => {
    const creds: ConnectionCredentials = {
      ...baseCredentials,
      uri: "bolt://localhost:7687/existing",
      database: "otherdb",
    };
    const result = buildAuthConfig(creds);
    // ensureDatabaseInUri preserves existing path
    expect(result.uri).toContain("existing");
  });

  it("handles postgres URI scheme", () => {
    const creds: ConnectionCredentials = {
      uri: "postgresql://localhost:5432",
      username: "pguser",
      password: "pgpass",
      database: "appdb",
    };
    const result = buildAuthConfig(creds);
    expect(result.uri).toContain("appdb");
    expect(result.username).toBe("pguser");
    expect(result.password).toBe("pgpass");
    expect(result.authType).toBe(1);
  });

  it("handles empty string database (treats as no database)", () => {
    const creds: ConnectionCredentials = {
      ...baseCredentials,
      database: "",
    };
    const result = buildAuthConfig(creds);
    // Empty database string: ensureDatabaseInUri returns uri unchanged
    expect(result.uri).toBe("bolt://localhost:7687");
  });

  it("returns an object with exactly the expected keys", () => {
    const result = buildAuthConfig(baseCredentials);
    expect(Object.keys(result).sort()).toEqual(
      ["authType", "password", "uri", "username"].sort(),
    );
  });

  it("does not expose advanced options (connectionTimeout, etc.)", () => {
    const creds: ConnectionCredentials = {
      ...baseCredentials,
      connectionTimeout: 5000,
      queryTimeout: 30000,
      maxPoolSize: 10,
    };
    const result = buildAuthConfig(creds);
    expect(result).not.toHaveProperty("connectionTimeout");
    expect(result).not.toHaveProperty("queryTimeout");
    expect(result).not.toHaveProperty("maxPoolSize");
  });
});

describe("schema-prefetch module exports", () => {
  it("exports buildAuthConfig as a function", async () => {
    const mod = await import("@/lib/schema-prefetch");
    expect(typeof mod.buildAuthConfig).toBe("function");
  });

  it("exports fetchConnectionSchema as a function", async () => {
    const mod = await import("@/lib/schema-prefetch");
    expect(typeof mod.fetchConnectionSchema).toBe("function");
  });

  it("exports prefetchSchema as a function", async () => {
    const mod = await import("@/lib/schema-prefetch");
    expect(typeof mod.prefetchSchema).toBe("function");
  });
});
