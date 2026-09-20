import { describe, it, expect } from "vitest";
import { isGraphNode, isGraphRelationship, isGraphPath } from "../row-shapes";

const node = {
  $type: "node",
  identity: 42,
  elementId: "4:abc:42",
  labels: ["Customer"],
  properties: {},
};
const relationship = {
  $type: "relationship",
  identity: 7,
  elementId: "5:abc:7",
  type: "BOUGHT",
  properties: {},
  start: 42,
  end: 43,
};
/** No endpoint keys: what an unbound relationship looks like (#1904). */
const unbound = {
  $type: "relationship",
  identity: 8,
  elementId: "5:abc:8",
  type: "BOUGHT",
  properties: {},
};
const path = { $type: "path", start: node, end: node, segments: [], length: 0 };

describe("row-shape guards read the $type tag and nothing else (#1925)", () => {
  it.each([
    ["a node", node, true, false, false],
    ["a relationship", relationship, false, true, false],
    ["an unbound relationship", unbound, false, true, false],
    ["a path", path, false, false, true],
  ])("recognises %s", (_l, v, isNode, isRel, isPath) => {
    expect(isGraphNode(v)).toBe(isNode);
    expect(isGraphRelationship(v)).toBe(isRel);
    expect(isGraphPath(v)).toBe(isPath);
  });

  // The whole point of the tag: a JSON column can hold any of these key sets.
  it.each([
    ["a node look-alike", { labels: ["x"], properties: {} }],
    ["a relationship look-alike", { type: "R", start: 1, end: 2 }],
    ["a path look-alike", { segments: [], start: 1, end: 2 }],
    ["a near-miss tag", { $type: "nodes", labels: [], properties: {} }],
    ["a non-string tag", { $type: 1, labels: [], properties: {} }],
    ["an empty object", {}],
    ["an array", []],
    ["a string", "node"],
    ["a number", 1],
    ["a boolean", true],
    ["null", null],
    ["undefined", undefined],
  ])("does not mistake %s for a graph value", (_label, v) => {
    expect(isGraphNode(v)).toBe(false);
    expect(isGraphRelationship(v)).toBe(false);
    expect(isGraphPath(v)).toBe(false);
  });

  it("narrows the type, so a node's elementId is a string", () => {
    const v: unknown = node;
    if (!isGraphNode(v)) throw new Error("expected a node");
    const id: string = v.elementId;
    expect(id).toBe("4:abc:42");
  });
});
