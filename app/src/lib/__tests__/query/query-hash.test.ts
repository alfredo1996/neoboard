import { describe, it, expect } from "vitest";
import { computeResultId } from "@/lib/query/query-hash";

describe("computeResultId", () => {
  it("is deterministic: same inputs produce same output", () => {
    const a = computeResultId("conn-1", "MATCH (n) RETURN n", { limit: 10 });
    const b = computeResultId("conn-1", "MATCH (n) RETURN n", { limit: 10 });
    expect(a).toBe(b);
  });

  it("returns exactly 16 hex characters", () => {
    const id = computeResultId("conn-1", "SELECT 1");
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  // #1964 (CodeRabbit): whitespace inside a literal is meaning too — 'a  b'
  // and 'a b' are different values. Only the ends of the text are trimmed.
  it("keeps inner whitespace: a literal differing only in spacing is a different query", () => {
    expect(
      computeResultId("conn-1", "MATCH (n) WHERE n.name = 'a  b' RETURN n"),
    ).not.toBe(
      computeResultId("conn-1", "MATCH (n) WHERE n.name = 'a b' RETURN n"),
    );
  });

  // #1964: case is not formatting in a query. `:Person` and `:person` are
  // different labels, `'Alice'` and `'alice'` different literals; folding them
  // kept a changed graph query's exploration state.
  it("keeps case: a query differing only in case is a different query", () => {
    expect(computeResultId("conn-1", "MATCH (n:Person) RETURN n")).not.toBe(
      computeResultId("conn-1", "MATCH (n:person) RETURN n"),
    );
    expect(
      computeResultId("conn-1", "SELECT * FROM t WHERE name = 'Alice'"),
    ).not.toBe(
      computeResultId("conn-1", "SELECT * FROM t WHERE name = 'alice'"),
    );
  });

  it("includes the database: the same query on two databases is two results", () => {
    const q = "MATCH (n) RETURN n";
    expect(computeResultId("conn-1", q, undefined, 25, "sales")).not.toBe(
      computeResultId("conn-1", q, undefined, 25, "hr"),
    );
    // No database is the connection's default, the same as before.
    expect(computeResultId("conn-1", q, undefined, 25, undefined)).toBe(
      computeResultId("conn-1", q, undefined, 25),
    );
  });

  it("normalizes leading/trailing whitespace", () => {
    const a = computeResultId("conn-1", "  SELECT 1  ");
    const b = computeResultId("conn-1", "SELECT 1");
    expect(a).toBe(b);
  });

  it("different connectionId → different hash", () => {
    const a = computeResultId("conn-1", "MATCH (n) RETURN n");
    const b = computeResultId("conn-2", "MATCH (n) RETURN n");
    expect(a).not.toBe(b);
  });

  it("different query → different hash", () => {
    const a = computeResultId("conn-1", "MATCH (n) RETURN n");
    const b = computeResultId("conn-1", "MATCH (n) RETURN n LIMIT 1");
    expect(a).not.toBe(b);
  });

  it("different params → different hash", () => {
    const a = computeResultId("conn-1", "MATCH (n) RETURN n", { id: 1 });
    const b = computeResultId("conn-1", "MATCH (n) RETURN n", { id: 2 });
    expect(a).not.toBe(b);
  });

  it("different row limit → different hash: a 25-row preview is not the full result (#1896)", () => {
    const full = computeResultId("conn-1", "SELECT * FROM t", undefined, 5000);
    const preview = computeResultId("conn-1", "SELECT * FROM t", undefined, 25);
    expect(preview).not.toBe(full);
    expect(computeResultId("conn-1", "SELECT * FROM t", undefined, 25)).toBe(
      preview,
    );
  });

  it("no params vs undefined → same hash", () => {
    const a = computeResultId("conn-1", "SELECT 1");
    const b = computeResultId("conn-1", "SELECT 1", undefined);
    expect(a).toBe(b);
  });
});
