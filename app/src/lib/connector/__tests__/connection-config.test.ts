import { describe, it, expect, vi } from "vitest";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import {
  fixtureDescriptor,
  FIXTURE_SECRETS,
} from "@/__tests__/fixtures/fixture-connector";

/**
 * Descriptor-driven config handling for the connections routes (#1901).
 * The connector here is a fixture — nothing below names a built-in one.
 */

vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/connector/connection-adapter", () => ({
  getConnector: (type: string) =>
    type === fixtureDescriptor.type ? fixtureDescriptor : undefined,
}));

const { redactConfig, keepStoredSecrets, validateConnectionConfig } =
  await import("../connection-config");

const STORED = {
  endpoint: "acme://host/book",
  region: "eu",
  pageSize: 50,
  maxRows: 2000,
  ...FIXTURE_SECRETS,
};

describe("redactConfig", () => {
  it("drops EVERY password-typed field, whatever its key", () => {
    expect(redactConfig(fixtureDescriptor, STORED)).toEqual({
      endpoint: "acme://host/book",
      region: "eu",
      pageSize: 50,
      maxRows: 2000,
    });
  });

  it("returns only declared keys — an undeclared stored key may be a secret from another version", () => {
    const out = redactConfig(fixtureDescriptor, {
      ...STORED,
      legacyPassphrase: "hunter2",
    });
    expect(out).not.toHaveProperty("legacyPassphrase");
  });

  it("returns nothing for a connector that is not installed: its secrets cannot be told apart", () => {
    expect(redactConfig(undefined, STORED)).toBeUndefined();
  });
});

describe("keepStoredSecrets", () => {
  it("keeps the stored value of every secret left blank or out", () => {
    const merged = keepStoredSecrets(
      fixtureDescriptor,
      { endpoint: "acme://new/book", apiToken: "", pageSize: 10 },
      STORED,
    );
    expect(merged).toEqual({
      endpoint: "acme://new/book",
      pageSize: 10,
      ...FIXTURE_SECRETS,
    });
  });

  it("replaces only the secret that was provided", () => {
    const merged = keepStoredSecrets(
      fixtureDescriptor,
      { endpoint: "acme://host/book", signingSecret: "rotated" },
      STORED,
    );
    expect(merged.apiToken).toBe(FIXTURE_SECRETS.apiToken);
    expect(merged.signingSecret).toBe("rotated");
  });

  it("never carries a non-secret over: the rest of the config is replaced", () => {
    const merged = keepStoredSecrets(
      fixtureDescriptor,
      { endpoint: "acme://host/book" },
      STORED,
    );
    expect(merged).not.toHaveProperty("region");
    expect(merged).not.toHaveProperty("pageSize");
  });
});

describe("validateConnectionConfig", () => {
  it("strips unknown keys and keeps the app's own maxRows", () => {
    const result = validateConnectionConfig(fixtureDescriptor.type, {
      endpoint: "acme://host/book",
      apiToken: FIXTURE_SECRETS.apiToken,
      maxRows: 2000,
      // Another connector's option, and something nobody declares.
      maxPoolSize: 10,
      isAdmin: true,
    });
    expect(result).toEqual({
      success: true,
      config: {
        endpoint: "acme://host/book",
        apiToken: FIXTURE_SECRETS.apiToken,
        maxRows: 2000,
      },
    });
  });

  it("answers 400 with one message per offending field, and never a value", async () => {
    const result = validateConnectionConfig(fixtureDescriptor.type, {
      endpoint: "https://host/book",
      apiToken: FIXTURE_SECRETS.apiToken,
      pageSize: 9000,
      // A secret of the wrong type is still a secret.
      signingSecret: { leaked: FIXTURE_SECRETS.signingSecret },
    });
    if (result.success) throw new Error("expected a validation failure");
    expect(result.response.status).toBe(400);
    const body = await result.response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.fields).toEqual({
      endpoint: expect.stringContaining("acme:"),
      pageSize: "Page Size must be at most 500",
      signingSecret: "Signing Secret must be text",
    });
    expect(body.error.message).toBe(body.error.details.fields.endpoint);
    const wire = JSON.stringify(body);
    expect(wire).not.toContain(FIXTURE_SECRETS.apiToken);
    expect(wire).not.toContain(FIXTURE_SECRETS.signingSecret);
    expect(wire).not.toContain("9000");
  });

  it("answers 400 for a type that is not registered", async () => {
    const result = validateConnectionConfig("nobody-installed-this", {});
    if (result.success) throw new Error("expected a validation failure");
    expect(result.response.status).toBe(400);
    expect((await result.response.json()).error.message).toBe(
      "Unknown connector type",
    );
  });
});
