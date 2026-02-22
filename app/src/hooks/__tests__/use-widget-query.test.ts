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
});
