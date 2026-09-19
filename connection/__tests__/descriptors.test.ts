import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createConnectorRegistry,
  toDescriptor,
  validateConfig,
  type ConnectorDescriptor,
  type ConnectorField,
} from "@neoboard/connector-sdk";
import { neo4jDescriptor } from "../src/neo4j/descriptor";
import { postgresDescriptor } from "../src/postgresql/descriptor";

jest.mock("neo4j-driver", () => ({
  __esModule: true,
  default: { driver: jest.fn(), auth: { basic: jest.fn() } },
}));
jest.mock("pg", () => ({ Pool: jest.fn() }));

const byKey = (descriptor: ConnectorDescriptor) =>
  Object.fromEntries(descriptor.fields.map((f) => [f.key, f])) as Record<
    string,
    ConnectorField
  >;

// The timeout range zod enforces today (connectionConfigSchema). The DOM said
// min=0 while the API said min(1000); the descriptor is now the one source.
const TIMEOUT = {
  type: "number",
  group: "advanced",
  min: 1000,
  max: 300_000,
  unit: "ms",
};
const POOL = { type: "number", group: "advanced", min: 1, max: 100 };

describe.each([
  ["neo4j", "../src/neo4j/descriptor.ts", neo4jDescriptor],
  ["postgresql", "../src/postgresql/descriptor.ts", postgresDescriptor],
])("%s descriptor", (_type, file, descriptor) => {
  it("imports no driver — only the SDK, which depends on nothing", () => {
    // The descriptor is what the browser may bundle. Importing a driver here —
    // or a sibling that does — would drag neo4j-driver / pg (and node:net)
    // into the client. The SDK is the one allowed import: its field builders
    // are pure, and the package has no dependency of its own to drag along.
    const source = readFileSync(join(__dirname, file), "utf8");
    const specifiers = [...source.matchAll(/^import [^;]*?from "([^"]+)";/gms)]
      .map((m) => m[1])
      .sort();
    expect([...new Set(specifiers)]).toEqual(["@neoboard/connector-sdk"]);
    const sdk = JSON.parse(
      readFileSync(join(__dirname, "../../connector-sdk/package.json"), "utf8"),
    );
    expect(Object.keys(sdk.dependencies ?? {})).toEqual([]);
  });

  it("owns its descriptor: nothing is shared with another connector", () => {
    // The builders come from the SDK, never from a sibling connector or a
    // shared file in this package — adding connector N+1 must not mean
    // editing, or importing from, connector N.
    const source = readFileSync(join(__dirname, file), "utf8");
    expect(source).not.toMatch(/from "\.\.?\//);
  });

  it("is plain JSON", () => {
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  it("passes the strict registry", () => {
    expect(() =>
      createConnectorRegistry().register({
        ...descriptor,
        createModule: () => {
          throw new Error("never called");
        },
      }),
    ).not.toThrow();
  });

  it("declares the four connection fields under their stored keys", () => {
    expect(
      descriptor.fields
        .filter((f) => f.group === "connection")
        .map((f) => [f.key, f.type, f.required ?? false]),
    ).toEqual([
      ["uri", "uri", true],
      ["username", "text", true],
      ["password", "password", true],
      ["database", "text", false],
    ]);
  });

  it("does not declare maxRows — the row cap is the app's policy", () => {
    expect(byKey(descriptor).maxRows).toBeUndefined();
  });
});

describe("neo4j descriptor", () => {
  it("carries the identity the plugin used to spell out", () => {
    expect(neo4jDescriptor).toMatchObject({
      type: "neo4j",
      label: "Neo4j",
      category: "graph",
      queryLanguage: "cypher",
      supportsGraphData: true,
      supportsWrite: true,
    });
  });

  it("lists the URI schemes once", () => {
    expect(byKey(neo4jDescriptor).uri.protocols).toEqual([
      "neo4j:",
      "neo4j+s:",
      "neo4j+ssc:",
      "bolt:",
      "bolt+s:",
      "bolt+ssc:",
    ]);
  });

  it("declares its advanced options with today's keys, ranges and placeholders", () => {
    const fields = byKey(neo4jDescriptor);
    expect(
      neo4jDescriptor.fields
        .filter((f) => f.group === "advanced")
        .map((f) => f.key),
    ).toEqual([
      "connectionTimeout",
      "queryTimeout",
      "maxPoolSize",
      "connectionAcquisitionTimeout",
    ]);
    expect(fields.connectionTimeout).toMatchObject({
      ...TIMEOUT,
      placeholder: "30000",
    });
    expect(fields.queryTimeout).toMatchObject({
      ...TIMEOUT,
      placeholder: "2000",
    });
    expect(fields.maxPoolSize).toMatchObject({ ...POOL, placeholder: "100" });
    expect(fields.connectionAcquisitionTimeout).toMatchObject({
      ...TIMEOUT,
      placeholder: "60000",
    });
  });
});

describe("postgresql descriptor", () => {
  it("carries the identity the plugin used to spell out", () => {
    expect(postgresDescriptor).toMatchObject({
      type: "postgresql",
      label: "PostgreSQL",
      category: "database",
      queryLanguage: "sql",
      supportsGraphData: false,
      supportsWrite: true,
    });
  });

  it("lists the URI schemes once", () => {
    expect(byKey(postgresDescriptor).uri.protocols).toEqual([
      "postgresql:",
      "postgres:",
    ]);
  });

  it("declares its advanced options with today's keys, ranges and placeholders", () => {
    const fields = byKey(postgresDescriptor);
    expect(
      postgresDescriptor.fields
        .filter((f) => f.group === "advanced")
        .map((f) => f.key),
    ).toEqual([
      "connectionTimeout",
      "idleTimeout",
      "maxPoolSize",
      "statementTimeout",
      "sslRejectUnauthorized",
    ]);
    expect(fields.connectionTimeout).toMatchObject({
      ...TIMEOUT,
      placeholder: "10000",
    });
    expect(fields.idleTimeout).toMatchObject({
      ...TIMEOUT,
      placeholder: "10000",
    });
    expect(fields.maxPoolSize).toMatchObject({ ...POOL, placeholder: "10" });
    expect(fields.statementTimeout).toMatchObject({
      ...TIMEOUT,
      placeholder: "30000",
    });
    expect(fields.sslRejectUnauthorized).toMatchObject({
      type: "boolean",
      group: "advanced",
    });
  });
});

describe("a config stored today validates against its descriptor", () => {
  // No data migration: every key a connection can hold today is a declared
  // field, except the app's own maxRows, which validateConfig strips.
  it("neo4j", () => {
    const stored = {
      uri: "neo4j+s://graph.internal:7687",
      username: "neo4j",
      password: "pw",
      database: "movies",
      connectionTimeout: 30000,
      queryTimeout: 2000,
      maxPoolSize: 100,
      connectionAcquisitionTimeout: 60000,
    };
    expect(
      validateConfig(neo4jDescriptor, { ...stored, maxRows: 5000 }),
    ).toEqual({ config: stored, errors: {} });
  });

  it("postgresql", () => {
    const stored = {
      uri: "postgresql://db.internal:5432/app?sslmode=require",
      username: "postgres",
      password: "pw",
      database: "app",
      connectionTimeout: 10000,
      idleTimeout: 10000,
      maxPoolSize: 10,
      statementTimeout: 30000,
      sslRejectUnauthorized: false,
    };
    expect(
      validateConfig(postgresDescriptor, { ...stored, maxRows: 5000 }),
    ).toEqual({ config: stored, errors: {} });
  });
});

describe("plugin = descriptor + factories", () => {
  it.each([
    ["neo4j", "../src/neo4j/plugin", "neo4jPlugin", neo4jDescriptor],
    [
      "postgresql",
      "../src/postgresql/plugin",
      "postgresPlugin",
      postgresDescriptor,
    ],
  ])("%s", (_type, path, exportName, descriptor) => {
    const plugin = require(path)[exportName];
    expect(toDescriptor(plugin)).toEqual(descriptor);
    expect(typeof plugin.createModule).toBe("function");
    expect(typeof plugin.createSchemaManager).toBe("function");
    // The old per-plugin spellings are gone — they live in `fields` now.
    for (const gone of [
      "allowedProtocols",
      "uriPlaceholder",
      "databasePlaceholder",
      "formFields",
    ]) {
      expect(plugin).not.toHaveProperty(gone);
    }
  });
});
