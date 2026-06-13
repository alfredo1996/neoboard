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
