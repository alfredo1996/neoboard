import { describe, it, expect } from "vitest";
import { importFollowUp } from "@/lib/dashboard/import-follow-up";

describe("importFollowUp", () => {
  it("offers nothing when every widget got a connection", () => {
    expect(importFollowUp(0, [])).toEqual({ kind: "none" });
  });

  it("offers nothing for a negative or nonsense count", () => {
    expect(importFollowUp(-1, ["neo4j"])).toEqual({ kind: "none" });
  });

  it("offers the bulk fix when one connector type was skipped", () => {
    expect(importFollowUp(43, ["neo4j"])).toEqual({ kind: "bulk", count: 43 });
  });

  // A NeoDash import has no per-key types to inspect; one target is still
  // correct for the whole dashboard.
  it("offers the bulk fix when no types are known", () => {
    expect(importFollowUp(5, [])).toEqual({ kind: "bulk", count: 5 });
  });

  it("offers the bulk fix when several skipped keys share a type", () => {
    expect(importFollowUp(9, ["neo4j", "neo4j"])).toEqual({
      kind: "bulk",
      count: 9,
    });
  });

  // One target connection cannot be right for a Cypher widget and a SQL widget
  // at the same time, so fall back to the per-widget note.
  it("falls back to the manual note when skipped types differ", () => {
    expect(importFollowUp(9, ["neo4j", "postgresql"])).toEqual({
      kind: "manual",
      count: 9,
    });
  });

  it("treats an unknown type as distinct from a known one", () => {
    expect(importFollowUp(2, ["neo4j", undefined])).toEqual({
      kind: "manual",
      count: 2,
    });
  });
});
