import { describe, it, expect } from "vitest";
import { planTermWrites } from "../term-writes";

const A = { kind: "entity", key: "A", parentKey: "" } as const;
const B = { kind: "entity", key: "B", parentKey: "" } as const;
const rowsOf = (plan: ReturnType<typeof planTermWrites>) =>
  plan.groups.flatMap((g) => g.rows.map((r) => ({ fields: g.fields, ...r })));

describe("planTermWrites: the later entry for a term wins (#2534)", () => {
  it("an edit then a removal leaves the term removed, nothing written", () => {
    const plan = planTermWrites([
      { ...A, displayName: "x" },
      { ...A, remove: true },
    ]);
    expect(plan.removals).toEqual([A]);
    expect(plan.groups).toEqual([]);
  });

  it("a removal then an edit revives the term with only the later fields", () => {
    const plan = planTermWrites([
      { ...A, description: "old" },
      { ...A, remove: true },
      { ...A, displayName: "new" },
    ]);
    expect(plan.removals).toEqual([A]);
    expect(rowsOf(plan)).toEqual([
      { fields: ["displayName"], ...A, displayName: "new" },
    ]);
  });

  it("three edits of one term end on the last value, fields folded in order", () => {
    const plan = planTermWrites([
      { ...A, displayName: "1" },
      { ...A, displayName: "2", hidden: true },
      { ...A, displayName: "3" },
    ]);
    expect(plan.removals).toEqual([]);
    expect(rowsOf(plan)).toEqual([
      {
        fields: ["displayName", "hidden"],
        ...A,
        displayName: "3",
        hidden: true,
      },
    ]);
  });

  it("terms sent the same fields share one group, others get their own", () => {
    const plan = planTermWrites([
      { ...A, displayName: "a" },
      { ...B, displayName: "b" },
      { ...B, kind: "property", key: "p", parentKey: "B", hidden: true },
    ]);
    expect(plan.groups.map((g) => [g.fields, g.rows.length])).toEqual([
      [["displayName"], 2],
      [["hidden"], 1],
    ]);
  });
});
