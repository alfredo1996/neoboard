import { describe, it, expect } from "vitest";
import { transformToGraphData, validateGraphData } from "../graph";

describe("transformToGraphData", () => {
  it("returns empty nodes and edges for empty input", () => {
    const result = transformToGraphData([]) as {
      nodes: unknown[];
      edges: unknown[];
    };
    expect(result).toEqual({ nodes: [], edges: [] });
  });

  it("extracts nodes from query results", () => {
    const data = [
      {
        n: {
          elementId: "node:0",
          labels: ["Person"],
          properties: { name: "Alice" },
        },
      },
    ];
    const result = transformToGraphData(data) as {
      nodes: Array<{ id: string; label: unknown; labels: string[] }>;
      edges: unknown[];
    };
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("node:0");
    expect(result.nodes[0].label).toBe("Alice");
  });

  it("extracts relationships", () => {
    const data = [
      {
        r: {
          elementId: "rel:0",
          type: "KNOWS",
          start: "node:0",
          end: "node:1",
          startNodeElementId: "node:0",
          endNodeElementId: "node:1",
          properties: {},
        },
      },
    ];
    const result = transformToGraphData(data) as {
      nodes: unknown[];
      edges: Array<{ source: string; target: string; label: string }>;
    };
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].label).toBe("KNOWS");
  });

  it("deduplicates nodes", () => {
    const node = {
      elementId: "node:42",
      labels: ["City"],
      properties: { name: "London" },
    };
    const data = [{ n: node }, { n: node }];
    const result = transformToGraphData(data) as {
      nodes: unknown[];
      edges: unknown[];
    };
    expect(result.nodes).toHaveLength(1);
  });

  it("extracts nodes from path segments", () => {
    const startNode = {
      elementId: "node:1",
      labels: ["A"],
      properties: { name: "Start" },
    };
    const endNode = {
      elementId: "node:2",
      labels: ["B"],
      properties: { name: "End" },
    };
    const rel = {
      elementId: "rel:1",
      type: "CONNECTED",
      start: "node:1",
      end: "node:2",
      startNodeElementId: "node:1",
      endNodeElementId: "node:2",
      properties: {},
    };
    const path = {
      start: startNode,
      end: endNode,
      segments: [{ start: startNode, relationship: rel, end: endNode }],
    };
    const data = [{ p: path }];
    const result = transformToGraphData(data) as {
      nodes: Array<{ id: string }>;
      edges: Array<{ label: string }>;
    };
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });

  it("skips non-object record values", () => {
    const data = [{ scalar: "just-a-string" }];
    const result = transformToGraphData(data) as {
      nodes: unknown[];
      edges: unknown[];
    };
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

describe("validateGraphData", () => {
  it("returns null for empty data", () => {
    expect(validateGraphData([])).toBeNull();
  });

  it("returns null when nodes are present", () => {
    const data = [{ n: { elementId: "1", labels: ["X"], properties: {} } }];
    expect(validateGraphData(data)).toBeNull();
  });

  it("returns error for tabular data", () => {
    const data = [{ name: "Alice", age: 30 }];
    const err = validateGraphData(data);
    expect(err).toBeTruthy();
    expect(err).toContain("Graph chart");
  });
});
