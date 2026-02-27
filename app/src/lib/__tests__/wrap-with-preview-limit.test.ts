import { describe, it, expect } from "vitest";
import { wrapWithPreviewLimit } from "@/lib/wrap-with-preview-limit";

describe("wrapWithPreviewLimit", () => {
  it("wraps a PostgreSQL query as a subquery with LIMIT", () => {
    const result = wrapWithPreviewLimit(
      "SELECT id, name FROM users",
      "postgresql"
    );
    expect(result).toBe(
      "SELECT * FROM (SELECT id, name FROM users) AS __preview LIMIT 25"
    );
  });

  it("removes trailing semicolon before wrapping for PostgreSQL", () => {
    const result = wrapWithPreviewLimit(
      "SELECT * FROM orders;",
      "postgresql"
    );
    expect(result).toBe(
      "SELECT * FROM (SELECT * FROM orders) AS __preview LIMIT 25"
    );
  });

  it("appends LIMIT to a Cypher query", () => {
    const result = wrapWithPreviewLimit(
      "MATCH (n:Movie) RETURN n.title",
      "neo4j"
    );
    expect(result).toBe("MATCH (n:Movie) RETURN n.title LIMIT 25");
  });

  it("removes trailing semicolon before appending for Cypher", () => {
    const result = wrapWithPreviewLimit(
      "MATCH (n) RETURN n;",
      "neo4j"
    );
    expect(result).toBe("MATCH (n) RETURN n LIMIT 25");
  });

  it("does not double-append LIMIT when Cypher query already has LIMIT", () => {
    const result = wrapWithPreviewLimit(
      "MATCH (m:Movie) RETURN m.title LIMIT 5",
      "neo4j"
    );
    expect(result).toBe("MATCH (m:Movie) RETURN m.title LIMIT 5");
  });

  it("does not double-append LIMIT when Cypher query has LIMIT with ORDER BY", () => {
    const result = wrapWithPreviewLimit(
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS label, count(p) AS value ORDER BY value DESC LIMIT 5",
      "neo4j"
    );
    expect(result).toBe(
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS label, count(p) AS value ORDER BY value DESC LIMIT 5"
    );
  });

  it("returns empty string for empty input", () => {
    expect(wrapWithPreviewLimit("", "neo4j")).toBe("");
    expect(wrapWithPreviewLimit("   ", "postgresql")).toBe("");
  });

  it("respects custom limit", () => {
    const result = wrapWithPreviewLimit("MATCH (n) RETURN n", "neo4j", 10);
    expect(result).toBe("MATCH (n) RETURN n LIMIT 10");
  });

  it("respects custom limit for PostgreSQL", () => {
    const result = wrapWithPreviewLimit("SELECT 1", "postgresql", 5);
    expect(result).toBe("SELECT * FROM (SELECT 1) AS __preview LIMIT 5");
  });
});
