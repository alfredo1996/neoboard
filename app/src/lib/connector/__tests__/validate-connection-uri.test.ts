import { describe, it, expect } from "vitest";
import { validateConnectionUri } from "../validate-connection-uri";

describe("validateConnectionUri (#1043)", () => {
  it("rejects a non-URI string", () => {
    expect(validateConnectionUri("not-a-uri", "neo4j")).toMatch(/valid URI/i);
    expect(validateConnectionUri("not-a-uri", "postgresql")).toMatch(
      /valid URI/i,
    );
  });

  it("rejects an empty URI", () => {
    expect(validateConnectionUri("   ", "neo4j")).toMatch(/required/i);
  });

  it("rejects a wrong scheme for the connector type", () => {
    expect(
      validateConnectionUri("postgresql://localhost:5432", "neo4j"),
    ).toMatch(/scheme/i);
    expect(
      validateConnectionUri("bolt://localhost:7687", "postgresql"),
    ).toMatch(/scheme/i);
  });

  it("accepts valid Neo4j schemes", () => {
    expect(validateConnectionUri("bolt://localhost:7687", "neo4j")).toBeNull();
    expect(validateConnectionUri("neo4j+s://host.example", "neo4j")).toBeNull();
  });

  it("accepts valid PostgreSQL schemes", () => {
    expect(
      validateConnectionUri("postgresql://localhost:5432/db", "postgresql"),
    ).toBeNull();
    expect(
      validateConnectionUri("postgres://user@host:5432/db", "postgresql"),
    ).toBeNull();
  });

  it("rejects a URI with no host", () => {
    expect(validateConnectionUri("bolt://", "neo4j")).toMatch(
      /valid URI|host/i,
    );
  });
});

// #1303 — a password in the URI is silently ignored by both connectors (they
// read host/port/database only and take auth from the separate fields), so it
// does nothing except sit in a plaintext `type: "text"` input, in the in-memory
// module cache key, and in any error quoting the URI.
describe("password in the URI (#1303)", () => {
  it("rejects a URI carrying user and password", () => {
    expect(
      validateConnectionUri(
        "postgresql://admin:s3cr3t@db:5432/app",
        "postgresql",
      ),
    ).toMatch(/do not put a password in the URI/i);
    expect(
      validateConnectionUri("bolt://neo4j:hunter2@graph:7687", "neo4j"),
    ).toMatch(/do not put a password in the URI/i);
  });

  // A bare username is NOT rejected: it is not a secret, and
  // `postgres://user@host/db` is a standard documented form that
  // "accepts valid PostgreSQL schemes" above already pins as valid.
  it("still accepts a URI carrying only a username", () => {
    expect(
      validateConnectionUri("postgresql://admin@db:5432/app", "postgresql"),
    ).toBeNull();
  });

  it("never echoes the password back in the message", () => {
    const msg =
      validateConnectionUri(
        "postgresql://admin:s3cr3t@db:5432/app",
        "postgresql",
      ) ?? "";
    expect(msg).not.toContain("s3cr3t");
  });

  it("still accepts a clean URI", () => {
    expect(
      validateConnectionUri("postgresql://db:5432/app", "postgresql"),
    ).toBeNull();
    expect(validateConnectionUri("bolt://graph:7687", "neo4j")).toBeNull();
  });
});
