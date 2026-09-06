import { describe, it, expect } from "vitest";
import {
  transformToHierarchicalData,
  validateHierarchicalData,
} from "../hierarchical-utils";

type Node = {
  name: string;
  value?: number;
  children?: Node[];
  [k: string]: unknown;
};

const asNodes = (v: unknown) => v as Node[];
const byName = (nodes: Node[], name: string) =>
  nodes.find((n) => n.name === name);

describe("transformToHierarchicalData — parents that only appear as references", () => {
  // The query shape our own docs publish (docs/charts/sunburst.mdx:18,
  // treemap.mdx:18) returns LEAF rows only: the parent is named in a column
  // but never returned as a row of its own. Every parent was therefore
  // dropped and the chart painted one flat ring.
  const leafRows = [
    { parent: "Drama", name: "Titanic", value: 3 },
    { parent: "Drama", name: "Gladiator", value: 5 },
    { parent: "Comedy", name: "Airplane", value: 2 },
  ];

  it("synthesises the parents named in the parent column", () => {
    const out = asNodes(transformToHierarchicalData(leafRows));
    expect(out.map((n) => n.name).sort()).toEqual(["Comedy", "Drama"]);
    expect(byName(out, "Drama")!.children!.map((c) => c.name)).toEqual([
      "Titanic",
      "Gladiator",
    ]);
  });

  it("leaves a synthesised parent's value unset so the chart sums its children", () => {
    // An explicit 0 gives a 0-degree arc; undefined makes ECharts and d3 total
    // the subtree instead.
    const out = asNodes(transformToHierarchicalData(leafRows));
    expect(byName(out, "Drama")!.value).toBeUndefined();
  });

  it("matches the parent column case-insensitively", () => {
    const out = asNodes(
      transformToHierarchicalData([
        { Parent: "Drama", name: "Titanic", value: 3 },
      ]),
    );
    expect(out.map((n) => n.name)).toEqual(["Drama"]);
  });
});

describe("transformToHierarchicalData — identity and values", () => {
  it("sums two rows sharing a parent and a name", () => {
    const out = asNodes(
      transformToHierarchicalData([
        { parent: "EU", name: "Widget", value: 3 },
        { parent: "EU", name: "Widget", value: 4 },
      ]),
    );
    expect(byName(out, "EU")!.children).toHaveLength(1);
    expect(byName(out, "EU")!.children![0].value).toBe(7);
  });

  it("keeps the same name under two parents as two nodes", () => {
    const out = asNodes(
      transformToHierarchicalData([
        { parent: "EU", name: "Widget", value: 3 },
        { parent: "US", name: "Widget", value: 9 },
      ]),
    );
    expect(byName(out, "EU")!.children![0].value).toBe(3);
    expect(byName(out, "US")!.children![0].value).toBe(9);
  });

  it("skips a leaf whose value cannot be drawn", () => {
    // NaN, Infinity and <= 0 have no area. Coercing them to 0 left an
    // invisible slice that still occupied a legend row and a tooltip.
    const out = asNodes(
      transformToHierarchicalData([
        { parent: "EU", name: "Good", value: 5 },
        { parent: "EU", name: "Zero", value: 0 },
        { parent: "EU", name: "Negative", value: -2 },
        { parent: "EU", name: "Text", value: "n/a" },
      ]),
    );
    expect(byName(out, "EU")!.children!.map((c) => c.name)).toEqual(["Good"]);
  });

  it("accepts a numeric string, as node-pg returns for NUMERIC", () => {
    const out = asNodes(
      transformToHierarchicalData([{ parent: "EU", name: "W", value: "42" }]),
    );
    expect(byName(out, "EU")!.children![0].value).toBe(42);
  });

  it("carries every query column onto the node", () => {
    // Styling rules and click actions resolve against these (#1598).
    const out = asNodes(
      transformToHierarchicalData([
        { parent: "EU", name: "Widget", value: 3, owner: "bob" },
      ]),
    );
    expect(byName(out, "EU")!.children![0].owner).toBe("bob");
  });

  it("keeps a lone root wrapped", () => {
    // Circle packing uses the root's name as its first breadcrumb crumb, so
    // the transform must not unwrap it.
    const out = asNodes(
      transformToHierarchicalData([{ parent: "All", name: "A", value: 1 }]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("All");
  });

  it("returns the reachable roots rather than throwing on a cycle", () => {
    // card-container catches a throwing transform and feeds the RAW rows to
    // the chart, which is worse than an empty result.
    const out = asNodes(
      transformToHierarchicalData([
        { parent: "B", name: "A", value: 1 },
        { parent: "A", name: "B", value: 1 },
      ]),
    );
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("validateHierarchicalData", () => {
  it("passes empty data through to the host's own empty state", () => {
    expect(validateHierarchicalData([])).toBeNull();
  });

  it("accepts the documented leaf-row shape", () => {
    expect(
      validateHierarchicalData([{ parent: "D", name: "T", value: 3 }]),
    ).toBeNull();
  });

  it("names the columns it found when no value column resolves", () => {
    const msg = validateHierarchicalData([{ name: "A", parent: "B" }]);
    expect(msg).toMatch(/numeric value column/i);
    expect(msg).toContain("name");
    expect(msg).toContain("parent");
  });

  it("reports a cycle with the path", () => {
    const msg = validateHierarchicalData([
      { parent: "B", name: "A", value: 1 },
      { parent: "A", name: "B", value: 1 },
    ]);
    expect(msg).toMatch(/cycle/i);
  });

  it("reports when no row carries a usable value", () => {
    const msg = validateHierarchicalData([
      { parent: "D", name: "T", value: -1 },
      { parent: "D", name: "U", value: 0 },
    ]);
    expect(msg).toMatch(/value/i);
  });
});
