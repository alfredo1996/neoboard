import { describe, it, expect } from "vitest";
import { transformToGraphData, validateGraphData } from "../../graph/transform";

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

/**
 * Synthetic (APOC virtual) node detection.
 *
 * Every fixture here is the shape a real Neo4j 5 + APOC 5.26.25 driver record
 * takes AFTER Neo4jRecordParser.parseGraphObject, measured over Bolt (#1361):
 *
 *   virtual node  identity {low:-289,high:-1} -> -289   elementId "-289"
 *   real node     identity {low:0,high:0}     ->    0   elementId "4:<uuid>:0"
 *   virtual rel   elementId is a UUID, but startNodeElementId/endNodeElementId
 *                 carry the node elementIds verbatim ("-289")
 *
 * identity arrives as a NUMBER (the parser runs Integer.toNumber() when in
 * safe range) while elementId arrives as a STRING — both forms are covered.
 */
describe("transformToGraphData — synthetic node detection", () => {
  const virtualNode = {
    identity: -289,
    elementId: "-289",
    labels: ["Summary"],
    properties: { name: "Totals" },
  };

  const realNode = {
    identity: 0,
    elementId: "4:1a7aa765-ebcb-4a7b-9859-ca21d0d78e50:0",
    labels: ["Document"],
    properties: { name: "079254C-0000-MTO-1311-003" },
  };

  type Nodes = { nodes: Array<{ id: string; synthetic?: boolean }> };

  it("marks a node whose elementId is a stringified negative integer", () => {
    const result = transformToGraphData([{ v: virtualNode }]) as Nodes;
    expect(result.nodes[0].id).toBe("-289");
    expect(result.nodes[0].synthetic).toBe(true);
  });

  it("does not mark a node with a real Neo4j 5 elementId", () => {
    const result = transformToGraphData([{ a: realNode }]) as Nodes;
    expect(result.nodes[0].id).toBe("4:1a7aa765-ebcb-4a7b-9859-ca21d0d78e50:0");
    expect(result.nodes[0].synthetic).toBeFalsy();
  });

  it('detects the string "-290" and the numeric -290 identically', () => {
    const fromString = transformToGraphData([
      { v: { ...virtualNode, elementId: "-290" } },
    ]) as Nodes;
    // No elementId — the id falls through to the parsed numeric identity.
    const fromNumber = transformToGraphData([
      { v: { identity: -290, labels: ["Summary"], properties: {} } },
    ]) as Nodes;

    expect(fromString.nodes[0].id).toBe("-290");
    expect(fromNumber.nodes[0].id).toBe("-290");
    expect(fromString.nodes[0].synthetic).toBe(true);
    expect(fromNumber.nodes[0].synthetic).toBe(true);
  });

  it("does not mark a node whose id came from the randomUUID fallback", () => {
    // Neither elementId nor identity — addNode falls back to crypto.randomUUID().
    const result = transformToGraphData([
      { v: { labels: ["Orphan"], properties: { name: "No id" } } },
    ]) as Nodes;
    expect(result.nodes[0].synthetic).toBeFalsy();
    expect(result.nodes[0].id).not.toMatch(/^-/);
  });

  it("does not mark node zero, however -0 is spelled", () => {
    // JS stringifies -0 as "0", and node id 0 is a real Neo4j node. APOC's
    // virtual counter starts at -1, so -0 is never a virtual id.
    const numericMinusZero = transformToGraphData([
      { v: { identity: -0, labels: ["Doc"], properties: {} } },
    ]) as Nodes;
    const stringMinusZero = transformToGraphData([
      { v: { elementId: "-0", labels: ["Doc"], properties: {} } },
    ]) as Nodes;

    expect(numericMinusZero.nodes[0].id).toBe("0");
    expect(numericMinusZero.nodes[0].synthetic).toBeFalsy();
    expect(stringMinusZero.nodes[0].synthetic).toBeFalsy();
  });

  it("leaves a mixed real/virtual graph with zero dangling edges", () => {
    // The behaviour that ALREADY works and must not regress: addNode keys on
    // elementId, addEdge on startNodeElementId/endNodeElementId, and they agree.
    const virtualRel = {
      identity: -275,
      elementId: "e1315589-8e3f-4a5e-9f0e-6c2a1d8b7c44",
      start: 0,
      startNodeElementId: realNode.elementId,
      end: -289,
      endNodeElementId: "-289",
      type: "SUMMARISES",
      properties: {},
    };

    const result = transformToGraphData([
      { a: realNode, v: virtualNode, rel: virtualRel },
    ]) as Nodes & {
      edges: Array<{ source: string; target: string; label: string }>;
    };

    const ids = new Set(result.nodes.map((n) => n.id));
    const dangling = result.edges.filter(
      (e) => !ids.has(e.source) || !ids.has(e.target),
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(dangling).toEqual([]);
    expect(result.edges[0].source).toBe(realNode.elementId);
    expect(result.edges[0].target).toBe("-289");
    expect(result.nodes.find((n) => n.id === "-289")?.synthetic).toBe(true);
    expect(
      result.nodes.find((n) => n.id === realNode.elementId)?.synthetic,
    ).toBeFalsy();
  });

  it("marks virtual nodes reached through a path", () => {
    // parseGraphObject returns Path/PathSegment untouched, so a parser-level
    // flag would miss these — detection has to live at the addNode funnel.
    const path = {
      start: realNode,
      end: virtualNode,
      segments: [
        {
          start: realNode,
          relationship: {
            elementId: "e1315589-8e3f-4a5e-9f0e-6c2a1d8b7c44",
            type: "SUMMARISES",
            start: 0,
            end: -289,
            startNodeElementId: realNode.elementId,
            endNodeElementId: "-289",
            properties: {},
          },
          end: virtualNode,
        },
      ],
    };

    const result = transformToGraphData([{ p: path }]) as Nodes;
    expect(result.nodes.find((n) => n.id === "-289")?.synthetic).toBe(true);
    expect(
      result.nodes.find((n) => n.id === realNode.elementId)?.synthetic,
    ).toBeFalsy();
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

/**
 * #1305 — a regression guard, not a Red gate.
 *
 * The leak itself was in `connection/` (Neo4jRecordParser returned driver Path
 * instances untouched, so their Integers crossed the wire as {low, high}), and
 * app/ legitimately cannot fix that: `normalizeValue` sees an object and
 * stringifies it, which is the correct generic behaviour for an object. What
 * app/ CAN pin is the contract it consumes — given the converted path shape
 * the connection layer now emits, the graph data must carry real numbers.
 *
 * Patching normalizeValue to special-case {low, high} was considered and
 * rejected: it would leave the table and JSON widgets, which render the raw
 * parsed record, still showing the nested object, and it would guess at a
 * shape the connection layer is contracted to have already resolved.
 */
describe("transformToGraphData — converted Neo4j path (#1305)", () => {
  const alice = {
    identity: 1,
    elementId: "node:1",
    labels: ["Person"],
    properties: { name: "Alice", age: 30 },
  };
  const bob = {
    identity: 2,
    elementId: "node:2",
    labels: ["Person"],
    properties: { name: "Bob", age: 41 },
  };
  const knows = {
    identity: 10,
    elementId: "rel:10",
    start: 1,
    end: 2,
    startNodeElementId: "node:1",
    endNodeElementId: "node:2",
    type: "KNOWS",
    properties: { since: 1999 },
  };
  const path = {
    start: alice,
    end: bob,
    segments: [{ start: alice, relationship: knows, end: bob }],
    length: 1,
  };

  function nodeById(result: unknown, id: string) {
    const { nodes } = result as { nodes: Record<string, unknown>[] };
    return nodes.find((n) => n.id === id)!;
  }

  it("keeps integer properties as numbers, not stringified objects", () => {
    const result = transformToGraphData([{ p: path }]);
    const props = nodeById(result, "node:1").properties as Record<
      string,
      unknown
    >;
    expect(props.age).toBe(30);
    expect(props.age).not.toBe('{"low":30,"high":0}');
  });

  it("carries relationship properties through as numbers", () => {
    const { edges } = transformToGraphData([{ p: path }]) as {
      edges: Record<string, unknown>[];
    };
    const props = edges[0].properties as Record<string, unknown>;
    expect(props.since).toBe(1999);
  });

  /**
   * `addNode` is first-wins (transform.ts), so before the connection-layer fix
   * the SAME node inspected clean or dirty depending on which binding the
   * record listed first — which is why one widget could show both behaviours
   * at once. Both orders must now agree.
   */
  it("gives the same result whichever binding comes first", () => {
    for (const record of [
      { p: path, n: alice },
      { n: alice, p: path },
    ]) {
      const props = nodeById(transformToGraphData([record]), "node:1")
        .properties as Record<string, unknown>;
      expect(props.age).toBe(30);
    }
  });

  it("still recognises the converted shape as a path", () => {
    const { nodes, edges } = transformToGraphData([{ p: path }]) as {
      nodes: unknown[];
      edges: unknown[];
    };
    // Both endpoints reached via segments, deduped against the path's own
    // start/end — the key names the conversion deliberately preserved.
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(validateGraphData({ nodes, edges })).toBeNull();
  });
});
