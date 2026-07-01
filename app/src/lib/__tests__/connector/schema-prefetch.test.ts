/**
 * schema-prefetch — unit tests for pure logic (node environment, no DOM).
 *
 * `buildAuthConfig` is a pure function. `fetchConnectionSchema` /
 * `prefetchSchema` dispatch through the connection-adapter's
 * `getSchemaManager` (#1119), which we mock here so the registry-lookup and
 * null-guard branches are unit-covered without the real driver modules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectionCredentials } from "@/lib/query/query-executor";

const getSchemaManager = vi.fn();
vi.mock("@/lib/connector/connection-adapter", () => ({
  getSchemaManager: (type: string) => getSchemaManager(type),
}));

import {
  buildAuthConfig,
  fetchConnectionSchema,
  prefetchSchema,
} from "@/lib/connector/schema-prefetch";

beforeEach(() => {
  getSchemaManager.mockReset();
});

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

describe("fetchConnectionSchema", () => {
  const creds: ConnectionCredentials = {
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "secret",
  };

  it("resolves the schema manager by type and returns its schema", async () => {
    const schema = { type: "neo4j", labels: ["Person"] };
    const fetchSchema = vi.fn().mockResolvedValue(schema);
    getSchemaManager.mockReturnValue({ fetchSchema });

    const result = await fetchConnectionSchema("neo4j", creds);

    expect(getSchemaManager).toHaveBeenCalledWith("neo4j");
    // Manager receives the built auth config (db embedded, NATIVE auth).
    expect(fetchSchema).toHaveBeenCalledWith(
      expect.objectContaining({ uri: creds.uri, authType: 1 }),
    );
    expect(result).toBe(schema);
  });

  it("returns null when the connector type has no schema manager", async () => {
    getSchemaManager.mockReturnValue(undefined);
    const result = await fetchConnectionSchema(
      "unknown" as unknown as Parameters<typeof fetchConnectionSchema>[0],
      creds,
    );
    expect(result).toBeNull();
  });
});

describe("prefetchSchema", () => {
  const creds: ConnectionCredentials = {
    uri: "postgresql://localhost:5432",
    username: "pg",
    password: "pw",
  };

  it("fires the fetch for the resolved manager", async () => {
    const fetchSchema = vi.fn().mockResolvedValue({});
    getSchemaManager.mockReturnValue({ fetchSchema });
    prefetchSchema("postgresql", creds);
    await vi.waitFor(() => expect(fetchSchema).toHaveBeenCalled());
  });

  it("swallows errors (schema is a non-critical cache)", async () => {
    const fetchSchema = vi.fn().mockRejectedValue(new Error("boom"));
    getSchemaManager.mockReturnValue({ fetchSchema });
    // Must not throw synchronously or reject unhandled.
    expect(() => prefetchSchema("postgresql", creds)).not.toThrow();
    await vi.waitFor(() => expect(fetchSchema).toHaveBeenCalled());
  });
});

describe("schema-prefetch module exports", () => {
  it("exports buildAuthConfig as a function", () => {
    expect(typeof buildAuthConfig).toBe("function");
  });

  it("exports fetchConnectionSchema as a function", () => {
    expect(typeof fetchConnectionSchema).toBe("function");
  });

  it("exports prefetchSchema as a function", () => {
    expect(typeof prefetchSchema).toBe("function");
  });
});
