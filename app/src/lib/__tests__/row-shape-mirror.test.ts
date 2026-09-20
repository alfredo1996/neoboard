/**
 * The component mirror of the row value contract's graph guards agrees with
 * the SDK's own (#1925).
 *
 * `component/src/lib/row-shapes.ts` restates three guards it cannot import:
 * `component/` may not depend on the SDK, and `app/` may not pull
 * `@neoboard/connection` into anything the browser bundles — that barrel drags
 * the drivers in, and with them `fs`, `net` and `tls`.
 *
 * This test may import both, because it never reaches a bundler. It is the
 * only thing standing between the mirror and silent drift.
 */

import { describe, it, expect } from "vitest";
import {
  isGraphNode as sdkIsGraphNode,
  isGraphRelationship as sdkIsGraphRelationship,
  isGraphPath as sdkIsGraphPath,
} from "@neoboard/connection";
import {
  isGraphNode,
  isGraphRelationship,
  isGraphPath,
} from "@neoboard/components/row-shapes";

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
const unbound = {
  $type: "relationship",
  identity: 8,
  elementId: "5:abc:8",
  type: "BOUGHT",
  properties: {},
};
const path = { $type: "path", start: node, end: node, segments: [], length: 0 };

const VALUES: ReadonlyArray<[string, unknown]> = [
  ["a tagged node", node],
  ["a tagged relationship", relationship],
  ["an unbound relationship", unbound],
  ["a tagged path", path],
  ["an untagged node look-alike", { labels: ["x"], properties: {} }],
  ["an untagged relationship look-alike", { type: "R", start: 1, end: 2 }],
  ["an untagged path look-alike", { segments: [], start: 1, end: 2 }],
  ["a wrongly tagged value", { $type: "nodes", labels: [], properties: {} }],
  ["a non-string tag", { $type: 1, labels: [], properties: {} }],
  ["a bare object", {}],
  ["an array", []],
  ["a string", "node"],
  ["a number", 1],
  ["null", null],
  ["undefined", undefined],
];

describe("component's row-shape guards mirror the SDK's (#1925)", () => {
  it.each(VALUES)("agrees on %s", (_label, value) => {
    expect(isGraphNode(value)).toBe(sdkIsGraphNode(value));
    expect(isGraphRelationship(value)).toBe(sdkIsGraphRelationship(value));
    expect(isGraphPath(value)).toBe(sdkIsGraphPath(value));
  });

  // Negative control: a mirror that answered false for everything would agree
  // with nothing, and the comparison above would still pass if the SDK did too.
  it("actually recognises the tagged shapes", () => {
    expect([node, relationship, unbound, path].map(isGraphNode)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(
      [node, relationship, unbound, path].map(isGraphRelationship),
    ).toEqual([false, true, true, false]);
    expect([node, relationship, unbound, path].map(isGraphPath)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});
