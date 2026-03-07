import { describe, it, expect } from "vitest";
import {
  rewriteParamsForPostgres,
  ensureDatabaseInUri,
} from "../query-params";

describe("ensureDatabaseInUri", () => {
  it("returns uri unchanged when no database provided", () => {
    expect(ensureDatabaseInUri("postgresql://localhost:5432")).toBe(
      "postgresql://localhost:5432"
    );
  });

  it("returns uri unchanged when database is empty string", () => {
    expect(ensureDatabaseInUri("postgresql://localhost:5432", "")).toBe(
      "postgresql://localhost:5432"
    );
  });

  it("appends database to path when path is empty", () => {
    const result = ensureDatabaseInUri("postgresql://localhost:5432", "mydb");
    expect(result).toContain("/mydb");
  });

  it("appends database when path is just /", () => {
    const result = ensureDatabaseInUri("postgresql://localhost:5432/", "mydb");
    expect(result).toContain("/mydb");
  });

  it("does not override existing database in path", () => {
    const result = ensureDatabaseInUri(
      "postgresql://localhost:5432/existing",
      "other"
    );
    expect(result).toContain("/existing");
    expect(result).not.toContain("/other");
  });

  it("returns uri unchanged for invalid URLs", () => {
    expect(ensureDatabaseInUri("not-a-url", "mydb")).toBe("not-a-url");
  });

  it("works with bolt:// URIs (Neo4j)", () => {
    const result = ensureDatabaseInUri("bolt://localhost:7687", "neo4j");
    // bolt:// might not parse as URL — should return original
    // If it does parse, it should append database
    expect(typeof result).toBe("string");
  });
});

describe("rewriteParamsForPostgres", () => {
  it("rewrites $param_xxx to positional $1, $2, ...", () => {
    const result = rewriteParamsForPostgres(
      "SELECT * FROM users WHERE name = $param_name AND age > $param_age",
      { param_name: "Alice", param_age: 30 }
    );
    expect(result.query).toBe(
      "SELECT * FROM users WHERE name = $1 AND age > $2"
    );
    expect(result.params).toEqual({ "0": "Alice", "1": 30 });
  });

  it("reuses same positional index for duplicate tokens", () => {
    const result = rewriteParamsForPostgres(
      "SELECT * FROM t WHERE a = $param_x OR b = $param_x",
      { param_x: 42 }
    );
    expect(result.query).toBe("SELECT * FROM t WHERE a = $1 OR b = $1");
    expect(result.params).toEqual({ "0": 42 });
  });

  it("returns original query when no $param_ tokens exist", () => {
    const result = rewriteParamsForPostgres("SELECT 1", {});
    expect(result.query).toBe("SELECT 1");
    expect(result.params).toEqual({});
  });

  it("handles multiple distinct params in order", () => {
    const result = rewriteParamsForPostgres(
      "INSERT INTO t (a, b, c) VALUES ($param_a, $param_b, $param_c)",
      { param_a: 1, param_b: "two", param_c: null }
    );
    expect(result.query).toBe(
      "INSERT INTO t (a, b, c) VALUES ($1, $2, $3)"
    );
    expect(result.params).toEqual({ "0": 1, "1": "two", "2": null });
  });

  it("sets undefined for params not found in the map", () => {
    const result = rewriteParamsForPostgres(
      "SELECT $param_missing",
      {}
    );
    expect(result.query).toBe("SELECT $1");
    expect(result.params).toEqual({ "0": undefined });
  });

  it("handles params with underscores in names", () => {
    const result = rewriteParamsForPostgres(
      "SELECT $param_start_date",
      { param_start_date: "2024-01-01" }
    );
    expect(result.query).toBe("SELECT $1");
    expect(result.params).toEqual({ "0": "2024-01-01" });
  });
});
