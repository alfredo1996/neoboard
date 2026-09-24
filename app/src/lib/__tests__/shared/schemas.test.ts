import { describe, it, expect, vi } from "vitest";

// Connector-type validation is registry-driven (#1121). Mock the registry
// membership check so the schema tests are deterministic and don't load DB
// drivers: one fixture type is "registered".
vi.mock("@/lib/connector/registered-types", () => ({
  isRegisteredConnectorType: (t: string) => t === "fixture-db",
}));

import {
  createConnectionSchema,
  updateConnectionSchema,
  testInlineSchema,
} from "@/lib/shared/schemas";

/**
 * The zod half of connection validation keeps only what the APP owns: name,
 * a registered type, visibility and `maxRows`. The config is a bag — its keys
 * and constraints belong to the connector's descriptor and are checked by
 * `validateConnectionConfig` (#1901), so no option key is spelled out here.
 */
const config = { endpoint: "fixture://host", apiToken: "t" };

describe("createConnectionSchema", () => {
  it("accepts a registered type with any config bag, and passes the bag through", () => {
    const result = createConnectionSchema.safeParse({
      name: "My Fixture",
      type: "fixture-db",
      config: { ...config, pageSize: 50, verifyTls: false },
    });
    expect(result.success).toBe(true);
    expect(result.data?.config).toEqual({
      ...config,
      pageSize: 50,
      verifyTls: false,
    });
  });

  it("rejects a missing name", () => {
    expect(
      createConnectionSchema.safeParse({ type: "fixture-db", config }).success,
    ).toBe(false);
  });

  it("rejects a type that is not registered", () => {
    const result = createConnectionSchema.safeParse({
      name: "My DB",
      type: "nobody-installed-this",
      config,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Unknown connector type");
  });

  it("rejects a config that is not an object", () => {
    for (const bad of [undefined, null, "uri", 7, []]) {
      expect(
        createConnectionSchema.safeParse({
          name: "My DB",
          type: "fixture-db",
          config: bad,
        }).success,
      ).toBe(false);
    }
  });
});

describe("maxRows — the app's own row-limit policy", () => {
  const parse = (maxRows: unknown) =>
    createConnectionSchema.safeParse({
      name: "My DB",
      type: "fixture-db",
      config: { ...config, maxRows },
    }).success;

  it("accepts 100 to 100000, and being left out", () => {
    expect(parse(undefined)).toBe(true);
    expect(parse(100)).toBe(true);
    expect(parse(100_000)).toBe(true);
  });

  it("rejects anything outside, fractional or not a number", () => {
    expect(parse(99)).toBe(false);
    expect(parse(100_001)).toBe(false);
    expect(parse(150.5)).toBe(false);
    expect(parse("5000")).toBe(false);
  });

  it("is held to the same bounds on update and on an inline test", () => {
    expect(
      updateConnectionSchema.safeParse({ config: { maxRows: 5 } }).success,
    ).toBe(false);
    expect(
      testInlineSchema.safeParse({
        type: "fixture-db",
        config: { maxRows: 5 },
      }).success,
    ).toBe(false);
  });
});

describe("updateConnectionSchema", () => {
  it("accepts a name-only and a config-only update", () => {
    expect(updateConnectionSchema.safeParse({ name: "New" }).success).toBe(
      true,
    );
    expect(updateConnectionSchema.safeParse({ config }).success).toBe(true);
  });

  // #1983: an empty update reached `.set({})` and answered 500.
  it("rejects an update that names nothing to change", () => {
    const result = updateConnectionSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      "Nothing to update: send name, config or visibility",
    );
  });

  it("rejects an empty name", () => {
    expect(updateConnectionSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts a config with its secrets left out — the route keeps the stored ones", () => {
    expect(
      updateConnectionSchema.safeParse({
        config: { endpoint: "fixture://host" },
      }).success,
    ).toBe(true);
  });

  it("accepts only the two visibilities", () => {
    expect(
      updateConnectionSchema.safeParse({ visibility: "shared" }).success,
    ).toBe(true);
    expect(
      updateConnectionSchema.safeParse({ visibility: "public" }).success,
    ).toBe(false);
  });
});

describe("testInlineSchema", () => {
  it("accepts a registered type and a config bag", () => {
    expect(
      testInlineSchema.safeParse({ type: "fixture-db", config }).success,
    ).toBe(true);
  });

  it("rejects a missing config and an unregistered type", () => {
    expect(testInlineSchema.safeParse({ type: "fixture-db" }).success).toBe(
      false,
    );
    expect(
      testInlineSchema.safeParse({ type: "nobody-installed-this", config })
        .success,
    ).toBe(false);
  });
});
