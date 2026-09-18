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

  it("normalizes whitespace: extra spaces produce same hash", () => {
    const a = computeResultId("conn-1", "MATCH  (n)   RETURN  n");
    const b = computeResultId("conn-1", "MATCH (n) RETURN n");
    expect(a).toBe(b);
  });

  it("normalizes case: uppercase and lowercase produce same hash", () => {
    const a = computeResultId("conn-1", "MATCH (n) RETURN n");
    const b = computeResultId("conn-1", "match (n) return n");
    expect(a).toBe(b);
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
