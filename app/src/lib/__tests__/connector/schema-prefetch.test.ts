/**
 * schema-prefetch — unit tests for pure logic (node environment, no DOM).
 *
 * `fetchConnectionSchema` / `prefetchSchema` dispatch through the
 * connection-adapter's `getSchemaManager` (#1119), which we mock here so the
 * registry-lookup and null-guard branches are unit-covered without the real
 * driver modules. The manager gets the connection's config bag as it is
 * (#1897) — the app no longer builds an auth object or an options bag.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConnectionCredentials } from "@/lib/query/query-executor";

const getSchemaManager = vi.fn();
vi.mock("@/lib/connector/connection-adapter", () => ({
  getSchemaManager: (type: string) => getSchemaManager(type),
}));

// The deployment facts `resolveContainerHost` reads — mocked at the leaves, so
// the rewrite under test is the real one (#1919).
let containerised = false;
vi.mock("@/lib/connector/is-containerised", () => ({
  isContainerised: () => containerised,
}));
vi.mock("@/lib/connector/host-alias", () => ({
  hostAliasResolves: async () => true,
}));

import {
  fetchConnectionSchema,
  prefetchSchema,
} from "@/lib/connector/schema-prefetch";

beforeEach(() => {
  getSchemaManager.mockReset();
  containerised = false;
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
    // ONE argument: the config bag itself — no authType, nothing renamed.
    expect(fetchSchema.mock.calls).toEqual([[creds]]);
    expect(result).toBe(schema);
  });

  // #1302: a big catalog can outlast the 30s introspection default; the
  // connection's statement timeout is the setting that raises it. The app
  // used to rename it to pgIntrospectionTimeoutMillis; now the connector reads
  // `statementTimeout` from the bag (pinned in connection's pg-schema test).
  it("passes every stored key through — database and options included", async () => {
    const fetchSchema = vi.fn().mockResolvedValue({});
    getSchemaManager.mockReturnValue({ fetchSchema });
    const full = {
      ...creds,
      uri: "postgresql://localhost:5432",
      database: "appdb",
      statementTimeout: 120_000,
      maxPoolSize: 3,
    };

    await fetchConnectionSchema("postgresql", full);

    expect(fetchSchema.mock.calls).toEqual([[full]]);
    // The URI is as typed: the connector applies `database` itself.
    expect(fetchSchema.mock.calls[0][0].uri).toBe(
      "postgresql://localhost:5432",
    );
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
  it("exports fetchConnectionSchema as a function", () => {
    expect(typeof fetchConnectionSchema).toBe("function");
  });

  it("exports prefetchSchema as a function", () => {
    expect(typeof prefetchSchema).toBe("function");
  });
});

// #1919: queries rewrite a loopback URI when NeoBoard runs in a container
// (#1346); the schema fetch did not, so a connection saved as
// bolt://localhost ran queries fine and had no schema panel and no
// autocomplete — silently, since the prefetch swallows its error.
describe("fetchConnectionSchema in a container (#1919)", () => {
  it("reaches the same host as the connection's queries", async () => {
    containerised = true;
    const fetchSchema = vi.fn().mockResolvedValue({});
    getSchemaManager.mockReturnValue({ fetchSchema });
    const stored = {
      uri: "bolt://localhost:7687",
      username: "u",
      database: "movies",
    };

    await fetchConnectionSchema("graphdb", stored);

    expect(fetchSchema).toHaveBeenCalledWith({
      uri: "bolt://host.docker.internal:7687",
      username: "u",
      database: "movies",
    });
    // What the user typed stays stored; only the driver sees the rewrite.
    expect(stored.uri).toBe("bolt://localhost:7687");
  });

  it("passes a config with no uri through untouched", async () => {
    containerised = true;
    const fetchSchema = vi.fn().mockResolvedValue({});
    getSchemaManager.mockReturnValue({ fetchSchema });

    await fetchConnectionSchema("files", { path: "/data" });

    expect(fetchSchema).toHaveBeenCalledWith({ path: "/data" });
  });
});
