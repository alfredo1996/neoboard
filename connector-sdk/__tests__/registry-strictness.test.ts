import {
  createConnectorRegistry,
  type ConnectorPlugin,
} from "../src/generalized/connector-plugin";
import {
  MAX_ICON_SVG_BYTES,
  type ConnectorField,
} from "../src/generalized/descriptor";

// A malformed descriptor used to log a warning and register anyway, so the
// first sign of it was a broken connection form. It now fails at startup,
// where the author sees it (#1897).

const field = (overrides: Partial<ConnectorField> = {}): ConnectorField => ({
  key: "host",
  label: "Host",
  type: "text",
  group: "connection",
  ...overrides,
});

const plugin = (overrides: Partial<ConnectorPlugin> = {}): ConnectorPlugin => ({
  type: "fixture-db",
  label: "Fixture DB",
  category: "database",
  fields: [field()],
  createModule: () => {
    throw new Error("never called");
  },
  ...overrides,
});

const register = (overrides: Partial<ConnectorPlugin>) => () =>
  createConnectorRegistry().register(plugin(overrides));

describe("createConnectorRegistry — strict descriptor validation", () => {
  it("registers a well-formed plugin, including one with no fields", () => {
    expect(register({})).not.toThrow();
    expect(register({ fields: [] })).not.toThrow();
  });

  it("throws when fields is not an array", () => {
    expect(
      register({ fields: undefined as unknown as ConnectorField[] }),
    ).toThrow(/fields must be an array/);
  });

  it.each(["key", "label", "type"] as const)(
    "throws when a field is missing its %s",
    (prop) => {
      expect(register({ fields: [field({ [prop]: "" })] })).toThrow(
        /field is missing key, label or type/,
      );
    },
  );

  it("throws on an unknown field type", () => {
    expect(
      register({
        fields: [field({ type: "color" as ConnectorField["type"] })],
      }),
    ).toThrow(/field "host" has unknown type "color"/);
  });

  it("throws on an unknown field group", () => {
    expect(
      register({
        fields: [field({ group: "sidebar" as ConnectorField["group"] })],
      }),
    ).toThrow(/field "host" has invalid group "sidebar"/);
  });

  it("throws on duplicate field keys", () => {
    expect(register({ fields: [field(), field({ label: "Again" })] })).toThrow(
      /duplicate field key "host"/,
    );
  });

  it.each([undefined, []])("throws on a select with options %p", (options) => {
    expect(register({ fields: [field({ type: "select", options })] })).toThrow(
      /select field "host" has no options/,
    );
  });

  it.each([undefined, []])("throws on a uri field with protocols %p", (p) => {
    expect(
      register({ fields: [field({ type: "uri", protocols: p })] }),
    ).toThrow(/uri field "host" declares no protocols/);
  });

  it("throws on an invalid category", () => {
    expect(
      register({ category: "spreadsheet" as ConnectorPlugin["category"] }),
    ).toThrow(/invalid category "spreadsheet"/);
  });

  it("throws on an iconSvg over the size cap, and accepts one at the cap", () => {
    expect(register({ iconSvg: "x".repeat(MAX_ICON_SVG_BYTES) })).not.toThrow();
    expect(register({ iconSvg: "x".repeat(MAX_ICON_SVG_BYTES + 1) })).toThrow(
      /iconSvg is larger than/,
    );
  });

  it("measures the icon in bytes, not characters", () => {
    // "é" is two bytes in UTF-8: half the cap in characters is the whole cap.
    expect(
      register({ iconSvg: "é".repeat(MAX_ICON_SVG_BYTES / 2 + 1) }),
    ).toThrow(/iconSvg is larger than/);
  });

  it("names the connector in the error", () => {
    expect(register({ fields: [field(), field()] })).toThrow(/"fixture-db"/);
  });

  it("registers nothing when validation fails", () => {
    const registry = createConnectorRegistry();
    expect(() =>
      registry.register(plugin({ fields: [field(), field()] })),
    ).toThrow();
    expect(registry.has("fixture-db")).toBe(false);
  });
});
