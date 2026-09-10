import { sparseOrders } from "@/__tests__/fixtures/connector-output";
import { describe, it, expect } from "vitest";
import {
  transformToSankeyData,
  validateSankeyData,
} from "../../sankey/transform";

type Sankey = {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
};

const build = (rows: Record<string, unknown>[]) =>
  transformToSankeyData(rows) as Sankey;
const names = (s: Sankey) => s.nodes.map((n) => n.name);
// Links also carry their raw row under `properties` (#1598); passthrough.test.ts owns that.
const link = (source: string, target: string, value = 1) =>
  expect.objectContaining({ source, target, value });

describe("transformToSankeyData", () => {
  it("produces { nodes, links }", () => {
    const result = build([{ source: "A", target: "B", value: 10 }]);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].source).toBe("A");
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it("returns empty for empty input", () => {
    const result = build([]);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("returns empty for a single-column result", () => {
    expect(build([{ only: "A" }])).toEqual({ nodes: [], links: [] });
  });

  it("defaults value to 1 when the result has no value column", () => {
    expect(build([{ source: "A", target: "B" }]).links).toEqual([
      link("A", "B", 1),
    ]);
  });

  // #1656 — the demo's "continent" option selects r.name AS source and
  // r.continent AS target, and two seeded regions are named after their own
  // continent. The self-edge held that node's in-degree above zero and
  // echarts' sankeyLayout threw "Sankey is a DAG, the original data has
  // cycle!" over the whole widget.
  it("drops a self-loop row whole, node included (#1656)", () => {
    const result = build([
      { source: "Northeast US", target: "North America", value: 2 },
      { source: "Oceania", target: "Oceania", value: 5 },
    ]);

    expect(result.links).toEqual([link("Northeast US", "North America", 2)]);
    // Keeping the node is not free: an edgeless node has layout value 0,
    // which zeroes layoutIterations for the WHOLE diagram
    // (sankeyLayout.js:62-67) and shrinks every other bar through minKy
    // (sankeyLayout.js:273-284). Dropping it is both smaller and safer.
    expect(names(result)).not.toContain("Oceania");
    expect(names(result)).toEqual(["Northeast US", "North America"]);
  });

  it("drops a row with an empty endpoint whole, by the same rule", () => {
    expect(build([{ source: "A", target: null, value: 3 }])).toEqual({
      nodes: [],
      links: [],
    });
  });

  // A sankey node legitimately has many parents — that is the whole point of
  // the chart. A cycle check borrowed from the hierarchy transform, which
  // infers a cycle from "unreachable from a root", would call this a cycle.
  it("keeps a diamond, where two paths converge on one node", () => {
    const rows = [
      { source: "A", target: "B", value: 1 },
      { source: "A", target: "C", value: 1 },
      { source: "B", target: "D", value: 1 },
      { source: "C", target: "D", value: 1 },
    ];
    expect(build(rows).links).toHaveLength(4);
    expect(validateSankeyData(rows)).toBeNull();
  });
});

describe("validateSankeyData", () => {
  it("returns null for empty data", () => {
    expect(validateSankeyData([])).toBeNull();
  });

  it("reports a cycle instead of letting echarts throw (#1656)", () => {
    const msg = validateSankeyData([
      { source: "A", target: "B", value: 1 },
      { source: "B", target: "A", value: 1 },
    ]);
    expect(msg).toMatch(/loops back/);
    expect(msg).not.toMatch(/DAG/);
  });

  it("reports a cycle longer than two hops", () => {
    expect(
      validateSankeyData([
        { source: "A", target: "B", value: 1 },
        { source: "B", target: "C", value: 1 },
        { source: "C", target: "A", value: 1 },
      ]),
    ).toMatch(/loops back/);
  });

  it("says why nothing is drawable when every row is a self-loop", () => {
    const msg = validateSankeyData([{ source: "X", target: "X", value: 1 }]);
    expect(msg).toMatch(/No row describes a flow between two different nodes/);
    expect(msg).toContain('"source"');
    expect(msg).toContain('"target"');
  });

  it("says the same when every row has an empty endpoint", () => {
    expect(
      validateSankeyData([{ source: "A", target: null, value: 1 }]),
    ).toMatch(/No row describes a flow between two different nodes/);
  });

  it("says the same for a mix of both", () => {
    expect(
      validateSankeyData([
        { source: "X", target: "X", value: 1 },
        { source: "A", target: null, value: 1 },
      ]),
    ).toMatch(/No row describes a flow between two different nodes/);
  });

  // One degenerate row must not blank an otherwise correct diagram — this is
  // the demo's exact shape.
  it("returns null when only some rows are self-loops", () => {
    expect(
      validateSankeyData([
        { source: "Oceania", target: "Oceania", value: 1 },
        { source: "Northeast US", target: "North America", value: 2 },
      ]),
    ).toBeNull();
  });

  it("rejects a single-column result", () => {
    expect(validateSankeyData([{ only: "A" }])).toMatch(
      /needs source and target columns/,
    );
  });
});

describe("connector-shaped fixtures (#1636)", () => {
  const [delivered, pending] = sparseOrders().map((o) => o.status);
  type Sankey1636 = {
    nodes: Array<{ name: string }>;
    links: Array<{ source: string; target: string; value: number }>;
  };

  it("resolves from/to by name when the columns are not in source-target order", () => {
    // Positional fallback would read `value` as the source and `to` as the
    // target; the name-based detection is what every shipped query relies on.
    const out = transformToSankeyData([
      { value: 5, to: delivered, from: pending },
    ]) as Sankey1636;
    expect(out.links).toEqual([
      expect.objectContaining({ source: pending, target: delivered, value: 5 }),
    ]);
  });

  it("drops a row whose endpoint is null instead of linking to an empty node", () => {
    const out = transformToSankeyData([
      { from: null, to: delivered, value: 1 },
      { from: pending, to: delivered, value: 2 },
    ]) as Sankey1636;
    expect(out.links).toHaveLength(1);
    expect(out.nodes.map((n) => n.name)).not.toContain("");
  });
});
