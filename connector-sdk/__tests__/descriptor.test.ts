import {
  toDescriptor,
  validateConfig,
  type ConnectorDescriptor,
} from "../src/generalized/descriptor";
import type { ConnectorPlugin } from "../src/generalized/connector-plugin";

// A descriptor that uses every field type once, plus a second password field —
// the contract must not assume a connector has exactly one secret (#1897).
const descriptor: ConnectorDescriptor = {
  type: "fixture-db",
  label: "Fixture DB",
  category: "database",
  queryLanguage: "sql",
  supportsWrite: true,
  fields: [
    {
      key: "uri",
      label: "URI",
      type: "uri",
      group: "connection",
      required: true,
      protocols: ["fixture:", "fixture+tls:"],
    },
    { key: "username", label: "Username", type: "text", group: "connection" },
    {
      key: "password",
      label: "Password",
      type: "password",
      group: "connection",
      required: true,
    },
    {
      key: "apiToken",
      label: "API token",
      type: "password",
      group: "connection",
      required: true,
    },
    {
      key: "poolSize",
      label: "Pool size",
      type: "number",
      group: "advanced",
      min: 1,
      max: 100,
    },
    {
      key: "region",
      label: "Region",
      type: "select",
      group: "advanced",
      options: [
        { label: "EU", value: "eu" },
        { label: "US", value: "us" },
      ],
    },
    { key: "tls", label: "TLS", type: "boolean", group: "advanced" },
  ],
};

const valid = {
  uri: "fixture://db.internal:5555/app",
  username: "app",
  password: "s3cret",
  apiToken: "tok_123",
  poolSize: 10,
  region: "eu",
  tls: false,
};

describe("validateConfig", () => {
  it("accepts a valid config and returns it unchanged, with no errors", () => {
    expect(validateConfig(descriptor, valid)).toEqual({
      config: valid,
      errors: {},
    });
  });

  it("does not mutate its input", () => {
    const input = { ...valid, stray: 1 };
    const copy = { ...input };
    validateConfig(descriptor, input);
    expect(input).toEqual(copy);
  });

  it("strips unknown keys instead of rejecting them", () => {
    const { config, errors } = validateConfig(descriptor, {
      ...valid,
      authType: 1,
      maxRows: 5000,
    });
    expect(errors).toEqual({});
    expect(config).toEqual(valid);
  });

  describe("required", () => {
    it.each([undefined, null, ""])(
      "reports a required field whose value is %p",
      (value) => {
        const { errors } = validateConfig(descriptor, {
          ...valid,
          password: value,
        });
        expect(errors).toEqual({ password: "Password is required" });
      },
    );

    it("holds each of two password fields to its own rule", () => {
      const { errors } = validateConfig(descriptor, {
        ...valid,
        password: "",
        apiToken: undefined,
      });
      expect(errors).toEqual({
        password: "Password is required",
        apiToken: "API token is required",
      });
    });

    it("omits an optional field that is absent or empty", () => {
      const { config, errors } = validateConfig(descriptor, {
        uri: valid.uri,
        password: valid.password,
        apiToken: valid.apiToken,
        username: "",
        poolSize: undefined,
        region: null,
      });
      expect(errors).toEqual({});
      expect(config).toEqual({
        uri: valid.uri,
        password: valid.password,
        apiToken: valid.apiToken,
      });
    });

    it("keeps falsy values that are real answers (false, 0)", () => {
      const zeroOk: ConnectorDescriptor = {
        ...descriptor,
        fields: [
          {
            key: "retries",
            label: "Retries",
            type: "number",
            group: "advanced",
          },
          { key: "tls", label: "TLS", type: "boolean", group: "advanced" },
        ],
      };
      expect(validateConfig(zeroOk, { retries: 0, tls: false })).toEqual({
        config: { retries: 0, tls: false },
        errors: {},
      });
    });
  });

  describe("text and password", () => {
    it.each(["username", "password"])("rejects a non-string %s", (key) => {
      const { errors } = validateConfig(descriptor, { ...valid, [key]: 42 });
      expect(errors[key]).toMatch(/must be text/);
    });
  });

  describe("number", () => {
    it.each([
      ["a numeric string", "10"],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["a boolean", true],
    ])("rejects %s", (_name, value) => {
      const { errors } = validateConfig(descriptor, {
        ...valid,
        poolSize: value,
      });
      expect(errors.poolSize).toMatch(/must be a number/);
    });

    it("rejects a fraction — number fields are integers", () => {
      const { errors } = validateConfig(descriptor, {
        ...valid,
        poolSize: 1.5,
      });
      expect(errors.poolSize).toMatch(/whole number/);
    });

    it("enforces min and max, inclusive", () => {
      const at = (poolSize: number) =>
        validateConfig(descriptor, { ...valid, poolSize }).errors.poolSize;
      expect(at(0)).toMatch(/at least 1/);
      expect(at(1)).toBeUndefined();
      expect(at(100)).toBeUndefined();
      expect(at(101)).toMatch(/at most 100/);
    });

    it("has no bound when min and max are absent", () => {
      const open: ConnectorDescriptor = {
        ...descriptor,
        fields: [{ key: "n", label: "N", type: "number", group: "advanced" }],
      };
      expect(validateConfig(open, { n: -1_000_000 }).errors).toEqual({});
    });
  });

  describe("select", () => {
    it("rejects a value outside the options", () => {
      const { errors } = validateConfig(descriptor, {
        ...valid,
        region: "mars",
      });
      expect(errors.region).toMatch(/must be one of: eu, us/);
    });
  });

  describe("boolean", () => {
    it.each(["true", 1, 0])("rejects %p", (value) => {
      const { errors } = validateConfig(descriptor, { ...valid, tls: value });
      expect(errors.tls).toMatch(/must be true or false/);
    });
  });

  describe("uri", () => {
    const uriError = (uri: unknown) =>
      validateConfig(descriptor, { ...valid, uri }).errors.uri;

    it("accepts every protocol the field lists", () => {
      expect(uriError("fixture://host")).toBeUndefined();
      expect(uriError("fixture+tls://host:5555/app")).toBeUndefined();
    });

    it("rejects a protocol outside the field's allowlist", () => {
      expect(uriError("redis://host:6379")).toMatch(/protocol/i);
    });

    it("rejects an unparseable URI without echoing it back", () => {
      const message = uriError("not a uri s3cret");
      expect(message).toMatch(/Invalid URI format/);
      expect(message).not.toContain("s3cret");
    });

    it("rejects a URI with no hostname", () => {
      expect(uriError("fixture://")).toBeDefined();
    });

    it("rejects a port outside 1–65535", () => {
      expect(uriError("fixture://host:0")).toMatch(/port/i);
      expect(uriError("fixture://host:99999")).toBeDefined();
    });

    it("rejects a URI that embeds a password, without echoing it", () => {
      const message = uriError("fixture://app:hunter2@host:5555/app");
      expect(message).toMatch(/password in the URI/i);
      expect(message).not.toContain("hunter2");
    });

    it("still accepts a bare username in the URI — it is not a secret", () => {
      expect(uriError("fixture://app@host:5555/app")).toBeUndefined();
    });

    it("rejects a non-string", () => {
      expect(uriError(42)).toMatch(/must be text/);
    });
  });

  it("treats a field type it does not know as text", () => {
    // The registry rejects an unknown type, but validateConfig is pure and can
    // be handed any descriptor: it must not throw on one.
    const odd = {
      ...descriptor,
      fields: [
        {
          key: "colour",
          label: "Colour",
          type: "color" as "text",
          group: "advanced" as const,
        },
      ],
    };
    expect(validateConfig(odd, { colour: "red" })).toEqual({
      config: { colour: "red" },
      errors: {},
    });
    expect(validateConfig(odd, { colour: 7 }).errors.colour).toMatch(
      /must be text/,
    );
  });

  it("does not throw on a select without options or a uri without protocols", () => {
    // Both are malformed — the registry refuses them — but validateConfig is
    // pure and may be handed a descriptor that never went through it.
    const loose: ConnectorDescriptor = {
      ...descriptor,
      fields: [
        { key: "region", label: "Region", type: "select", group: "advanced" },
        { key: "uri", label: "URI", type: "uri", group: "connection" },
      ],
    };
    const { config, errors } = validateConfig(loose, {
      region: "eu",
      uri: "anything://host:1234",
    });
    // No options: nothing is a member. No protocols: any scheme passes.
    expect(errors).toEqual({ region: "Region must be one of: " });
    expect(config).toEqual({ uri: "anything://host:1234" });
  });

  it("reports every failing field at once", () => {
    const { errors } = validateConfig(descriptor, {
      uri: "redis://host",
      poolSize: 0,
      region: "mars",
      tls: "yes",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["apiToken", "password", "poolSize", "region", "tls", "uri"].sort(),
    );
  });
});

describe("toDescriptor", () => {
  const plugin: ConnectorPlugin = {
    ...descriptor,
    iconSvg: "<svg/>",
    createModule: () => {
      throw new Error("never called");
    },
    createSchemaManager: () => ({ fetchSchema: async () => ({ type: "x" }) }),
  };

  it("returns the descriptor's data and nothing else", () => {
    expect(toDescriptor(plugin)).toEqual({ ...descriptor, iconSvg: "<svg/>" });
  });

  it("leaks no function, at any depth", () => {
    const hasFunction = (value: unknown): boolean =>
      typeof value === "function" ||
      (typeof value === "object" &&
        value !== null &&
        Object.values(value).some(hasFunction));
    expect(hasFunction(toDescriptor(plugin))).toBe(false);
  });

  it("survives a JSON round trip unchanged", () => {
    const data = toDescriptor(plugin);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("drops properties that are not part of the contract", () => {
    // The descriptor is served to the browser (#1899): only declared keys may
    // cross, so a stray constant on a plugin or a field cannot ride along.
    const leaky = {
      ...plugin,
      internalDefaultToken: "tok_live",
      fields: [{ ...plugin.fields[0], testId: "uri-input" }],
    } as unknown as ConnectorPlugin;
    const data = toDescriptor(leaky) as unknown as Record<string, unknown>;
    expect(data.internalDefaultToken).toBeUndefined();
    expect(
      (data.fields as Record<string, unknown>[])[0].testId,
    ).toBeUndefined();
  });

  it("returns copies, so a caller cannot mutate the registered plugin", () => {
    const data = toDescriptor(plugin);
    data.fields[0].protocols?.push("evil:");
    data.fields.pop();
    expect(plugin.fields).toHaveLength(descriptor.fields.length);
    expect(plugin.fields[0].protocols).toEqual(["fixture:", "fixture+tls:"]);
  });
});
