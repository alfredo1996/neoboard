import { describe, it, expect } from "vitest";
import { getAllConnectors } from "@neoboard/connection";
import { validateConnectionUri } from "../validate-connection-uri";

/**
 * The URI field of a connector's descriptor — what the dialog has in hand from
 * `GET /api/connectors`. The schemes and the example are the connector's own
 * (#1903): nothing here, or in the file under test, spells one out.
 */
const fixtureUri = {
  protocols: ["fixturedb:", "fixturedb+tls:"],
  placeholder: "fixturedb://localhost:4242",
};

describe("validateConnectionUri (#1043)", () => {
  it("rejects a non-URI string, with the connector's own example", () => {
    expect(validateConnectionUri("not-a-uri", fixtureUri)).toBe(
      "Enter a valid URI, e.g. fixturedb://localhost:4242.",
    );
  });

  it("rejects a non-URI string without an example when the descriptor has none", () => {
    expect(validateConnectionUri("not-a-uri", { protocols: [] })).toBe(
      "Enter a valid URI.",
    );
    expect(validateConnectionUri("not-a-uri", undefined)).toBe(
      "Enter a valid URI.",
    );
  });

  it("rejects an empty URI", () => {
    expect(validateConnectionUri("   ", fixtureUri)).toMatch(/required/i);
  });

  it("rejects a scheme the connector does not declare, and lists the ones it does", () => {
    expect(validateConnectionUri("otherdb://localhost:1", fixtureUri)).toBe(
      'Unexpected scheme "otherdb". Use one of: fixturedb, fixturedb+tls.',
    );
  });

  it("accepts every scheme the connector declares", () => {
    expect(validateConnectionUri("fixturedb://host:1", fixtureUri)).toBeNull();
    expect(
      validateConnectionUri("fixturedb+tls://host.example", fixtureUri),
    ).toBeNull();
  });

  it("checks no scheme when the descriptor is not there yet — the server re-validates", () => {
    expect(validateConnectionUri("anything://host:1", undefined)).toBeNull();
  });

  it.each(
    getAllConnectors().map(
      (c) => [c.type, c.fields.find((f) => f.type === "uri")!] as const,
    ),
  )("%s: its placeholder passes its own validation", (_type, field) => {
    expect(validateConnectionUri(field.placeholder!, field)).toBeNull();
  });

  it("rejects a URI with no host", () => {
    expect(validateConnectionUri("fixturedb://", fixtureUri)).toMatch(
      /valid URI|host/i,
    );
  });
});

// #1303 — a password in the URI is silently ignored by the connectors (they
// read host/port/database only and take auth from the separate fields), so it
// does nothing except sit in a plaintext `type: "text"` input, in the in-memory
// module cache key, and in any error quoting the URI.
describe("password in the URI (#1303)", () => {
  it("rejects a URI carrying user and password", () => {
    expect(
      validateConnectionUri("fixturedb://admin:s3cr3t@db:5432/app", fixtureUri),
    ).toMatch(/do not put a password in the URI/i);
  });

  // A bare username is NOT rejected: it is not a secret, and
  // `scheme://user@host/db` is a standard documented form.
  it("still accepts a URI carrying only a username", () => {
    expect(
      validateConnectionUri("fixturedb://admin@db:5432/app", fixtureUri),
    ).toBeNull();
  });

  it("never echoes the password back in the message", () => {
    const msg =
      validateConnectionUri(
        "fixturedb://admin:s3cr3t@db:5432/app",
        fixtureUri,
      ) ?? "";
    expect(msg).not.toContain("s3cr3t");
  });

  it("still accepts a clean URI", () => {
    expect(
      validateConnectionUri("fixturedb://db:5432/app", fixtureUri),
    ).toBeNull();
  });
});
