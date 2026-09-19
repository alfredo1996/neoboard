import {
  databaseField,
  passwordField,
  poolSizeField,
  timeoutField,
  uriField,
  usernameField,
} from "../src/generalized/fields";
import { createConnectorRegistry } from "../src/generalized/connector-plugin";
import { validateConfig } from "../src/generalized/descriptor";

// Small, optional builders for the fields most connectors share. Each returns
// the literal an author would otherwise write by hand — so these tests pin the
// literal, key order included: the connection form is a projection of it.

const json = (value: unknown) => JSON.stringify(value);

describe("uriField", () => {
  it("is a required `uri` connection field carrying the connector's own protocols", () => {
    expect(
      json(
        uriField({
          protocols: ["mydb:", "mydb+tls:"],
          placeholder: "mydb://localhost:5555",
        }),
      ),
    ).toBe(
      json({
        key: "uri",
        label: "URI",
        type: "uri",
        group: "connection",
        required: true,
        placeholder: "mydb://localhost:5555",
        protocols: ["mydb:", "mydb+tls:"],
      }),
    );
  });

  it("leaves no `placeholder` key behind when none is given", () => {
    expect(uriField({ protocols: ["mydb:"] })).not.toHaveProperty(
      "placeholder",
    );
  });

  it("copies the protocol list, so two descriptors never share one array", () => {
    const protocols = ["mydb:"];
    const field = uriField({ protocols });
    field.protocols?.push("evil:");
    expect(protocols).toEqual(["mydb:"]);
  });
});

describe("usernameField", () => {
  it("is a required text connection field", () => {
    expect(json(usernameField("admin"))).toBe(
      json({
        key: "username",
        label: "Username",
        type: "text",
        group: "connection",
        required: true,
        placeholder: "admin",
      }),
    );
  });

  it("takes no placeholder", () => {
    expect(usernameField()).not.toHaveProperty("placeholder");
  });
});

describe("passwordField", () => {
  it("is a required password connection field", () => {
    expect(json(passwordField())).toBe(
      json({
        key: "password",
        label: "Password",
        type: "password",
        group: "connection",
        required: true,
      }),
    );
  });
});

describe("databaseField", () => {
  it("is an optional text connection field", () => {
    expect(
      json(
        databaseField({
          placeholder: "app",
          description: "Leave empty for the default.",
        }),
      ),
    ).toBe(
      json({
        key: "database",
        label: "Database",
        type: "text",
        group: "connection",
        placeholder: "app",
        description: "Leave empty for the default.",
      }),
    );
  });

  it("takes no options at all", () => {
    expect(databaseField()).toEqual({
      key: "database",
      label: "Database",
      type: "text",
      group: "connection",
    });
    expect(Object.keys(databaseField())).toEqual([
      "key",
      "label",
      "type",
      "group",
    ]);
  });
});

describe("timeoutField", () => {
  it("is an advanced number field in ms, 1000–300000, under the key and label given", () => {
    expect(json(timeoutField("idleTimeout", "Idle Timeout", "10000"))).toBe(
      json({
        key: "idleTimeout",
        label: "Idle Timeout",
        type: "number",
        group: "advanced",
        placeholder: "10000",
        min: 1000,
        max: 300_000,
        unit: "ms",
      }),
    );
  });

  it("takes no placeholder", () => {
    expect(timeoutField("t", "T")).not.toHaveProperty("placeholder");
  });
});

describe("poolSizeField", () => {
  it("is an advanced number field, 1–100, stored as maxPoolSize", () => {
    expect(json(poolSizeField("10"))).toBe(
      json({
        key: "maxPoolSize",
        label: "Max Pool Size",
        type: "number",
        group: "advanced",
        placeholder: "10",
        min: 1,
        max: 100,
      }),
    );
  });

  it("takes no placeholder", () => {
    expect(poolSizeField()).not.toHaveProperty("placeholder");
  });
});

describe("the builders together", () => {
  const descriptor = {
    type: "fixture-db",
    label: "Fixture DB",
    category: "database" as const,
    fields: [
      uriField({ protocols: ["fixture:"] }),
      usernameField(),
      passwordField(),
      databaseField(),
      timeoutField("connectionTimeout", "Connection Timeout"),
      poolSizeField(),
      // Optional by design: a builder's result can be adjusted by spreading
      // it, and a hand-written literal sits next to them.
      { ...databaseField(), key: "schema", label: "Schema", required: true },
      {
        key: "tls",
        label: "TLS",
        type: "boolean" as const,
        group: "advanced" as const,
      },
    ],
  };

  it("pass the strict registry", () => {
    expect(() =>
      createConnectorRegistry().register({
        ...descriptor,
        createModule: () => {
          throw new Error("never called");
        },
      }),
    ).not.toThrow();
  });

  it("are plain JSON", () => {
    expect(JSON.parse(json(descriptor))).toEqual(descriptor);
  });

  it("carry constraints validateConfig enforces", () => {
    const { errors } = validateConfig(descriptor, {
      uri: "other://host",
      username: "u",
      password: "p",
      schema: "public",
      connectionTimeout: 999,
      maxPoolSize: 101,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "connectionTimeout",
      "maxPoolSize",
      "uri",
    ]);
  });
});
