import { describe, it, expect } from "vitest";
import { extractReferencedParams } from "../use-widget-query";

describe("extractReferencedParams", () => {
  it("returns empty object when query has no placeholders", () => {
    const result = extractReferencedParams("MATCH (n) RETURN n", { foo: "bar" });
    expect(result).toEqual({});
  });

  it("extracts a single referenced param", () => {
    const result = extractReferencedParams(
      "MATCH (n {id: $param_nodeId}) RETURN n",
      { nodeId: "abc", other: 42 }
    );
    expect(result).toEqual({ param_nodeId: "abc" });
  });

  it("extracts multiple referenced params", () => {
    const result = extractReferencedParams(
      "MATCH (n)-[:REL]->(m) WHERE n.id = $param_from AND m.id = $param_to RETURN n, m",
      { from: "a", to: "b", unrelated: "x" }
    );
    expect(result).toEqual({ param_from: "a", param_to: "b" });
  });

  it("ignores params that are referenced in the query but not in allParams", () => {
    const result = extractReferencedParams(
      "MATCH (n {id: $param_missing}) RETURN n",
      { other: "val" }
    );
    expect(result).toEqual({});
  });

  it("does not include unreferenced params even if they are in allParams", () => {
    const result = extractReferencedParams(
      "MATCH (n {id: $param_used}) RETURN n",
      { used: 1, unused: 2 }
    );
    expect(result).toEqual({ param_used: 1 });
    expect(result).not.toHaveProperty("param_unused");
  });

  it("handles empty allParams", () => {
    const result = extractReferencedParams("MATCH (n {id: $param_x}) RETURN n", {});
    expect(result).toEqual({});
  });

  it("handles empty query", () => {
    const result = extractReferencedParams("", { foo: "bar" });
    expect(result).toEqual({});
  });

  it("handles duplicate placeholders in query — de-duped to last assignment", () => {
    const result = extractReferencedParams(
      "WHERE n.a = $param_x OR n.b = $param_x",
      { x: "val" }
    );
    // Both occurrences map to the same key — result should still have it once
    expect(result).toEqual({ param_x: "val" });
  });

  // ── Multi-value parameter support (multi-select) ───────────────────────────

  it("passes through array values for multi-select parameters unchanged", () => {
    // The query uses ANY($1) / WHERE genre = ANY($param_genre) — the user writes
    // the query; extractReferencedParams just forwards the value as-is.
    const result = extractReferencedParams(
      "SELECT * FROM movies WHERE genre = ANY($param_genre)",
      { genre: ["Action", "Drama"] }
    );
    expect(result).toEqual({ param_genre: ["Action", "Drama"] });
  });

  it("passes through null/undefined values without modification", () => {
    const result = extractReferencedParams(
      "SELECT * FROM t WHERE id = $param_id",
      { id: null }
    );
    expect(result).toEqual({ param_id: null });
  });

  // ── Date-range companion parameters ───────────────────────────────────────

  it("extracts _from and _to companion parameters for date-range", () => {
    const result = extractReferencedParams(
      "SELECT * FROM events WHERE created_at BETWEEN $param_period_from AND $param_period_to",
      { period_from: "2024-01-01", period_to: "2024-01-31", period: { from: "2024-01-01", to: "2024-01-31" } }
    );
    expect(result).toEqual({
      param_period_from: "2024-01-01",
      param_period_to: "2024-01-31",
    });
  });

  // ── Number-range companion parameters ─────────────────────────────────────

  it("extracts _min and _max companion parameters for number-range", () => {
    const result = extractReferencedParams(
      "SELECT * FROM products WHERE price BETWEEN $param_price_min AND $param_price_max",
      { price_min: 10, price_max: 500 }
    );
    expect(result).toEqual({ param_price_min: 10, param_price_max: 500 });
  });

  // ── Number values ──────────────────────────────────────────────────────────

  it("passes through numeric parameter values", () => {
    const result = extractReferencedParams(
      "MATCH (n) WHERE n.age > $param_minAge RETURN n",
      { minAge: 18 }
    );
    expect(result).toEqual({ param_minAge: 18 });
  });
});
