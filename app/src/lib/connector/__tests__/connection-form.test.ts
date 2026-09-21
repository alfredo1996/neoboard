import { describe, it, expect } from "vitest";
import {
  fixtureDescriptor,
  FIXTURE_SECRETS,
} from "@/__tests__/fixtures/fixture-connector";
import {
  EMPTY_CONNECTION_FORM,
  configToForm,
  connectionFormErrors,
  formToConfig,
  hasFormErrors,
  isSecretField,
  toFormFields,
} from "../connection-form";

/**
 * The connection form's pure half (#1901): descriptor → fields, form state ↔
 * config bag, inline errors. Driven by a fixture connector throughout.
 */

const { fields } = fixtureDescriptor;

describe("isSecretField", () => {
  it("is true for every password-typed field and nothing else", () => {
    expect(fields.filter(isSecretField).map((f) => f.key)).toEqual([
      "apiToken",
      "signingSecret",
    ]);
  });
});

describe("toFormFields", () => {
  it("maps one group, with ids derived from the keys", () => {
    expect(toFormFields(fields, "advanced", "create")).toEqual([
      {
        name: "pageSize",
        id: "page-size",
        label: "Page Size",
        type: "number",
        placeholder: "100",
        min: 1,
        max: 500,
        unit: "rows",
      },
      {
        name: "signingSecret",
        id: "signing-secret",
        label: "Signing Secret",
        type: "password",
      },
      {
        name: "verifyTls",
        id: "verify-tls",
        label: "Verify TLS",
        type: "boolean",
      },
    ]);
  });

  it("renders a uri as text and carries required, description and options", () => {
    const [endpoint, apiToken, region] = toFormFields(
      fields,
      "connection",
      "create",
    );
    expect(endpoint).toMatchObject({ type: "text", required: true });
    expect(apiToken).toMatchObject({ type: "password", required: true });
    expect(region).toMatchObject({
      type: "select",
      description: "Where the workbook is hosted.",
      options: [
        { label: "Europe", value: "eu" },
        { label: "United States", value: "us" },
      ],
    });
  });

  it("in edit, no secret is required: blank keeps the stored one", () => {
    const secrets = [
      ...toFormFields(fields, "connection", "edit"),
      ...toFormFields(fields, "advanced", "edit"),
    ].filter((f) => f.type === "password");
    expect(secrets).toHaveLength(2);
    for (const secret of secrets) {
      expect(secret.required).toBeUndefined();
      expect(secret.placeholder).toBe("Leave blank to keep existing");
    }
  });
});

describe("formToConfig", () => {
  it("types each value by its field and drops what was left blank", () => {
    expect(
      formToConfig(fields, {
        endpoint: "  acme://host/book ",
        apiToken: " keeps its spaces ",
        region: "eu",
        pageSize: "50",
        signingSecret: "",
        verifyTls: false,
      }),
    ).toEqual({
      endpoint: "acme://host/book",
      apiToken: " keeps its spaces ",
      region: "eu",
      pageSize: 50,
      verifyTls: false,
    });
  });

  it("leaves a number it cannot read for validation to name", () => {
    expect(formToConfig(fields, { pageSize: "1.5" }).pageSize).toBe(1.5);
    expect(formToConfig(fields, { pageSize: "abc" }).pageSize).toBe("abc");
  });

  it("ignores values no field declares", () => {
    expect(formToConfig(fields, { maxPoolSize: "10" })).toEqual({});
  });
});

describe("configToForm", () => {
  it("fills the form from a stored config, numbers as text", () => {
    expect(
      configToForm(fields, {
        endpoint: "acme://host/book",
        region: "us",
        pageSize: 50,
        verifyTls: true,
        maxRows: 2000,
      }),
    ).toEqual({
      name: "",
      maxRows: "2000",
      config: {
        endpoint: "acme://host/book",
        region: "us",
        pageSize: "50",
        verifyTls: true,
      },
    });
  });

  it("never pre-fills a secret, even if one were handed over", () => {
    const { config } = configToForm(fields, {
      endpoint: "acme://host/book",
      ...FIXTURE_SECRETS,
    });
    expect(config).toEqual({ endpoint: "acme://host/book" });
  });
});

describe("connectionFormErrors", () => {
  const valid = {
    name: "Books",
    maxRows: "",
    config: { endpoint: "acme://host/book", apiToken: "t" },
  };

  it("is empty for a valid form", () => {
    const errors = connectionFormErrors(fixtureDescriptor, valid, "create");
    expect(errors).toEqual({ own: {}, config: {} });
    expect(hasFormErrors(errors)).toBe(false);
  });

  it("reports the name, every connector constraint and the row cap at once", () => {
    const errors = connectionFormErrors(
      fixtureDescriptor,
      {
        name: "  ",
        maxRows: "50",
        config: { endpoint: "https://host", pageSize: "9000" },
      },
      "create",
    );
    expect(errors).toEqual({
      own: {
        name: "Name is required",
        maxRows: "Max Rows per Query must be between 100 and 100000",
      },
      config: {
        endpoint: expect.stringContaining("acme:"),
        apiToken: "API Token is required",
        pageSize: "Page Size must be at most 500",
      },
    });
    expect(hasFormErrors(errors)).toBe(true);
  });

  it("in edit, a blank secret is not an error — the server keeps the stored one", () => {
    const errors = connectionFormErrors(
      fixtureDescriptor,
      { ...valid, config: { endpoint: "acme://host/book" } },
      "edit",
    );
    expect(errors.config).toEqual({});
  });

  it("rejects a row cap that is not a whole number", () => {
    const errors = connectionFormErrors(
      fixtureDescriptor,
      { ...valid, maxRows: "150.5" },
      "create",
    );
    expect(errors.own.maxRows).toMatch(/between 100 and 100000/);
  });

  it("starts from an empty form", () => {
    expect(EMPTY_CONNECTION_FORM).toEqual({
      name: "",
      maxRows: "",
      config: {},
    });
  });
});
