/**
 * formatCell — the text a table cell shows, which the table, the transforms
 * and the styling rules all read (#2050, #2102). Moved here from
 * table-renderer.test.tsx with the formatter itself.
 */
import { describe, it, expect } from "vitest";
import { formatCell } from "../cell-text";

// The SDK's canonical shapes, tagged by `$type` (#1904, #1925).
const node = (
  id: string,
  labels: string[],
  properties: Record<string, unknown>,
) => ({
  $type: "node",
  identity: id,
  elementId: `4:db:${id}`,
  labels,
  properties,
});

const rel = (
  type: string,
  from: { elementId: string },
  to: { elementId: string },
  properties: Record<string, unknown> = {},
) => ({
  $type: "relationship",
  identity: `${from.elementId}-${to.elementId}`,
  elementId: `5:db:${type}`,
  type,
  properties,
  start: from.elementId,
  startNodeElementId: from.elementId,
  end: to.elementId,
  endNodeElementId: to.elementId,
});

const keanu = node("1", ["Person", "Actor"], {
  name: "Keanu Reeves",
  born: 1964,
});
const matrix = node("2", ["Movie"], { title: "The Matrix", released: 1999 });
const lana = node("3", ["Person"], { name: "Lana Wachowski" });

const KEANU = ':Person:Actor {name: "Keanu Reeves", born: 1964}';
const MATRIX = ':Movie {title: "The Matrix", released: 1999}';
const LANA = ':Person {name: "Lana Wachowski"}';

const path = (start: unknown, segments: unknown[]) => ({
  $type: "path",
  start,
  end: start,
  segments,
  length: segments.length,
});

describe("formatCell", () => {
  it.each<[string, unknown, string]>([
    [
      "a node as its labels and properties",
      node("9", ["Movie"], {
        title: "Cloud Atlas",
        released: 2012,
        restricted: false,
        genres: ["Drama", "Sci-Fi"],
        meta: { rated: "R" },
      }),
      ':Movie {title: "Cloud Atlas", released: 2012, restricted: false, genres: ["Drama","Sci-Fi"], meta: {"rated":"R"}}',
    ],
    ["a node, never its $type or elementId", keanu, KEANU],
    ["a node with no properties", node("7", ["Genre"], {}), ":Genre"],
    ["an empty node", node("8", [], {}), "{}"],
    [
      "a relationship as its type and properties",
      rel("ACTED_IN", keanu, matrix, { roles: ["Neo"] }),
      '[:ACTED_IN {roles: ["Neo"]}]',
    ],
    [
      "a relationship with no properties",
      rel("DIRECTED", lana, matrix),
      "[:DIRECTED]",
    ],
    [
      // Keanu → The Matrix → Lana walks DIRECTED against its direction.
      "a path, each arrow the relationship's own direction",
      path(keanu, [
        {
          start: keanu,
          relationship: rel("ACTED_IN", keanu, matrix),
          end: matrix,
        },
        {
          start: matrix,
          relationship: rel("DIRECTED", lana, matrix),
          end: lana,
        },
      ]),
      `(${KEANU})-[:ACTED_IN]->(${MATRIX})<-[:DIRECTED]-(${LANA})`,
    ],
    ["a zero-length path as its one node", path(lana, []), `(${LANA})`],
    [
      // A JSON column, not a node: the tag is the only signal (#1925).
      "an untagged look-alike as JSON",
      { labels: ["Movie"], properties: { title: "X" } },
      '{"labels":["Movie"],"properties":{"title":"X"}}',
    ],
    [
      "a tagged value not the shape it claims as JSON",
      { $type: "node" },
      '{"$type":"node"}',
    ],
    ["a list of graph values", [keanu, matrix], `[${KEANU}, ${MATRIX}]`],
    [
      "a map holding graph values",
      { m: matrix, r: rel("DIRECTED", lana, matrix), n: 1 },
      `{m: ${MATRIX}, r: [:DIRECTED], n: 1}`,
    ],
    [
      "graph values at any depth, the rest as JSON",
      [[lana], { p: path(lana, []), tags: ["a", 1] }, "x", null],
      `[[${LANA}], {p: (${LANA}), tags: ["a",1]}, "x", null]`,
    ],
    [
      "a list with no graph value as JSON",
      [{ a: [1, "b"] }, null],
      '[{"a":[1,"b"]},null]',
    ],
    [
      "a map with no graph value as JSON",
      { a: { b: [true] } },
      '{"a":{"b":[true]}}',
    ],
    ["a string as itself", "plain", "plain"],
    ["a number", 42, "42"],
    ["a boolean", true, "true"],
    ["null", null, "null"],
  ])("reads %s", (_label, value, text) => {
    expect(formatCell(value)).toBe(text);
  });
});
