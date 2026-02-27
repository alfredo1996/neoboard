import { describe, it, expect } from "vitest";
import { extractReferencedParams, allReferencedParamsReady, getMissingParamNames } from "../use-widget-query";
import { resolveRelativePreset } from "@/lib/date-utils";

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

  // ── Date-relative dynamic _from/_to resolution ─────────────────────────
  // These test that resolveRelativePreset produces _from/_to values that
  // extractReferencedParams can consume (matching the dynamic computation in
  // useWidgetQuery's allParameters).

  it("date-relative _from/_to resolved dynamically are consumable by extractReferencedParams", () => {
    // Simulate what useWidgetQuery does: compute _from/_to from preset at call time
    const { from, to } = resolveRelativePreset("today");
    const allParameters = { window: "today", window_from: from, window_to: to };

    const result = extractReferencedParams(
      "SELECT * FROM events WHERE d >= $param_window_from AND d <= $param_window_to",
      allParameters
    );
    expect(result).toEqual({ param_window_from: from, param_window_to: to });
    // Verify the resolved dates match today
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(from).toBe(to); // "today" => same from and to
  });

  it("date-relative last_7_days produces a 7-day range ending today", () => {
    const { from, to } = resolveRelativePreset("last_7_days");
    const today = new Date();
    const isoToday = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    expect(to).toBe(isoToday);
    // from should be 6 days ago (6 days difference = 7 days total including today)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(6);
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

describe("getMissingParamNames", () => {
  it("returns empty array when query has no param placeholders", () => {
    expect(getMissingParamNames("MATCH (n) RETURN n", {})).toEqual([]);
  });

  it("returns empty array when all referenced params have values", () => {
    expect(
      getMissingParamNames(
        "MATCH (n {id: $param_nodeId}) RETURN n",
        { nodeId: "abc" }
      )
    ).toEqual([]);
  });

  it("returns names of missing params", () => {
    expect(
      getMissingParamNames(
        "WHERE n.a = $param_from AND n.b = $param_to",
        { from: "a" }
      )
    ).toEqual(["to"]);
  });

  it("returns all missing params when none have values", () => {
    expect(
      getMissingParamNames(
        "WHERE n.a = $param_from AND n.b = $param_to",
        {}
      )
    ).toEqual(["from", "to"]);
  });

  it("deduplicates when param is referenced multiple times", () => {
    expect(
      getMissingParamNames(
        "WHERE n.a = $param_x OR n.b = $param_x",
        {}
      )
    ).toEqual(["x"]);
  });

  it("treats empty string as missing", () => {
    expect(
      getMissingParamNames(
        "MATCH (n {id: $param_id}) RETURN n",
        { id: "" }
      )
    ).toEqual(["id"]);
  });

  it("treats null as missing", () => {
    expect(
      getMissingParamNames(
        "MATCH (n {id: $param_id}) RETURN n",
        { id: null }
      )
    ).toEqual(["id"]);
  });

  it("treats empty array as missing", () => {
    expect(
      getMissingParamNames(
        "SELECT * FROM t WHERE genre = ANY($param_genre)",
        { genre: [] }
      )
    ).toEqual(["genre"]);
  });

  it("does not include param with non-empty array value as missing", () => {
    expect(
      getMissingParamNames(
        "SELECT * FROM t WHERE genre = ANY($param_genre)",
        { genre: ["Action"] }
      )
    ).toEqual([]);
  });
});

describe("allReferencedParamsReady", () => {
  it("returns true when query has no param placeholders", () => {
    expect(allReferencedParamsReady("MATCH (n) RETURN n", {})).toBe(true);
  });

  it("returns true when all referenced params have values", () => {
    expect(
      allReferencedParamsReady(
        "MATCH (n {id: $param_nodeId}) RETURN n",
        { nodeId: "abc" }
      )
    ).toBe(true);
  });

  it("returns false when a referenced param is undefined", () => {
    expect(
      allReferencedParamsReady(
        "MATCH (n {id: $param_nodeId}) RETURN n",
        {}
      )
    ).toBe(false);
  });

  it("returns false when a referenced param is null", () => {
    expect(
      allReferencedParamsReady(
        "SELECT * FROM t WHERE id = $param_id",
        { id: null }
      )
    ).toBe(false);
  });

  it("returns false when a referenced param is an empty string", () => {
    expect(
      allReferencedParamsReady(
        "SELECT * FROM t WHERE country = $param_country",
        { country: "" }
      )
    ).toBe(false);
  });

  it("returns false when a referenced param is an empty array", () => {
    expect(
      allReferencedParamsReady(
        "SELECT * FROM t WHERE genre = ANY($param_genre)",
        { genre: [] }
      )
    ).toBe(false);
  });

  it("returns true when a referenced param is a non-empty array", () => {
    expect(
      allReferencedParamsReady(
        "SELECT * FROM t WHERE genre = ANY($param_genre)",
        { genre: ["Action"] }
      )
    ).toBe(true);
  });

  it("returns false when only one of two required params is set", () => {
    expect(
      allReferencedParamsReady(
        "WHERE n.a = $param_from AND n.b = $param_to",
        { from: "a" }
      )
    ).toBe(false);
  });

  it("returns true when all of multiple required params are set", () => {
    expect(
      allReferencedParamsReady(
        "WHERE n.a = $param_from AND n.b = $param_to",
        { from: "a", to: "b" }
      )
    ).toBe(true);
  });

  it("ignores unreferenced params — does not require them", () => {
    expect(
      allReferencedParamsReady(
        "MATCH (n) RETURN n",
        { unused: null, alsoUnused: "" }
      )
    ).toBe(true);
  });
});
