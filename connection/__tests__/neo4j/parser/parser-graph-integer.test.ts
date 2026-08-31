import { Neo4jRecordParser } from "../../../src/neo4j/Neo4jRecordParser";
import neo4j from "neo4j-driver";

const { Node, Relationship } = neo4j.types;
const { int } = neo4j;

describe("Neo4jRecordParser - Graph Integer Conversion", () => {
  const parser = new Neo4jRecordParser();

  it("converts Integer properties in Node to JS numbers", () => {
    const node = new Node(
      int(1),
      ["Person"],
      { age: int(30), score: int(1000), name: "Alice" },
      "node:1",
    );

    // parseGraphObject is called internally by __neo4jToNative via isGraphObject
    // We test the full _parse path by wrapping the node in a NeodashRecord-like object
    const fakeRecord = {
      keys: ["n"],
      get: (key: string) => (key === "n" ? node : undefined),
    } as any;

    const result = parser._parse(fakeRecord);
    const parsed = result["n"] as Record<string, unknown>;
    const props = parsed.properties as Record<string, unknown>;

    expect(typeof props.age).toBe("number");
    expect(props.age).toBe(30);
    expect(typeof props.score).toBe("number");
    expect(props.score).toBe(1000);
    expect(props.name).toBe("Alice");
  });

  it("converts Integer properties in Relationship to JS numbers", () => {
    const rel = new Relationship(
      int(10),
      int(1),
      int(2),
      "ACTED_IN",
      { weight: int(5) },
      "rel:10",
      "node:1",
      "node:2",
    );

    const fakeRecord = {
      keys: ["r"],
      get: (key: string) => (key === "r" ? rel : undefined),
    } as any;

    const result = parser._parse(fakeRecord);
    const parsed = result["r"] as Record<string, unknown>;

    // The parsed relationship is a plain object, not a Relationship instance
    expect(typeof parsed.type).toBe("string");
    expect(parsed.type).toBe("ACTED_IN");
    const props = parsed.properties as Record<string, unknown>;
    expect(typeof props.weight).toBe("number");
    expect(props.weight).toBe(5);
  });

  it("converts identity of Node to JS number", () => {
    const node = new Node(
      int(42),
      ["Movie"],
      { title: "The Matrix" },
      "node:42",
    );

    const fakeRecord = {
      keys: ["n"],
      get: (key: string) => (key === "n" ? node : undefined),
    } as any;

    const result = parser._parse(fakeRecord);
    const parsed = result["n"] as Record<string, unknown>;

    expect(parsed.identity).toBe(42);
    expect(parsed.elementId).toBe("node:42");
    expect(Array.isArray(parsed.labels)).toBe(true);
    expect((parsed.labels as string[])[0]).toBe("Movie");
  });
});

/**
 * #1305 — Path and PathSegment bypassed conversion entirely.
 *
 * `parseGraphObject` rebuilt Node and Relationship as plain objects with their
 * Integers resolved, but returned Path and PathSegment as the raw driver
 * instances. Those get JSON-serialised at the API boundary, so every Integer
 * inside a path's nodes and relationships crossed the wire as
 * `{"low":N,"high":0}` — and `normalizeValue` in app/ then stringified the
 * object, so the widget rendered the literal text `{"low":30,"high":0}`.
 *
 * The method's own doc comment claimed the opposite ("Handles Node,
 * Relationship, Path, PathSegment, and Point"), and no driver default
 * compensates: `disableLosslessIntegers` is deliberately NOT set, because the
 * parser needs real Integer objects for the inSafeRange() decision in
 * parsePrimitive (#1304).
 *
 * Reproduced on a real dashboard: a widget doing
 * `MATCH (p:Persona {...}) OPTIONAL MATCH path = (p)-[:VIAGGIA_CON*1..2]-(:Persona) RETURN p, path`
 * showed clean numbers for `p` and `{low, high}` for every node reached through
 * `path` — the same widget, both behaviours, decided purely by return shape.
 */
describe("Neo4jRecordParser - Path conversion (#1305)", () => {
  const parser = new Neo4jRecordParser();
  const { Path, PathSegment } = neo4j.types;

  function buildPath() {
    const alice = new Node(int(1), ["Person"], { age: int(30) }, "node:1");
    const bob = new Node(int(2), ["Person"], { age: int(41) }, "node:2");
    const knows = new Relationship(
      int(10),
      int(1),
      int(2),
      "KNOWS",
      { since: int(1999) },
      "rel:10",
      "node:1",
      "node:2",
    );
    const segment = new PathSegment(alice, knows, bob);
    return new Path(alice, bob, [segment]);
  }

  function parse(value: unknown) {
    const record = {
      keys: ["p"],
      get: (key: string) => (key === "p" ? value : undefined),
    } as any;
    return parser._parse(record)["p"] as Record<string, any>;
  }

  it("converts Integer properties on nodes inside a path", () => {
    const parsed = parse(buildPath());
    expect(parsed.segments[0].start.properties.age).toBe(30);
    expect(parsed.segments[0].end.properties.age).toBe(41);
  });

  it("converts Integer properties on relationships inside a path", () => {
    const parsed = parse(buildPath());
    expect(parsed.segments[0].relationship.properties.since).toBe(1999);
  });

  it("converts the path endpoints, not just the segments", () => {
    const parsed = parse(buildPath());
    expect(parsed.start.properties.age).toBe(30);
    expect(parsed.end.properties.age).toBe(41);
    expect(parsed.start.identity).toBe(1);
  });

  /**
   * The assertion that actually matters. Any future shape that slips through
   * un-converted fails here even if nobody thought to assert on it by name —
   * which is precisely how Path escaped for as long as it did.
   */
  it("leaves no {low, high} anywhere in the serialised path", () => {
    const parsed = parse(buildPath());
    expect(JSON.stringify(parsed)).not.toContain('"low"');
  });

  it("converts a bare PathSegment the same way", () => {
    const alice = new Node(int(1), ["Person"], { age: int(30) }, "node:1");
    const bob = new Node(int(2), ["Person"], { age: int(41) }, "node:2");
    const rel = new Relationship(
      int(10),
      int(1),
      int(2),
      "KNOWS",
      { since: int(1999) },
      "rel:10",
      "node:1",
      "node:2",
    );

    const parsed = parse(new PathSegment(alice, rel, bob));
    expect(parsed.start.properties.age).toBe(30);
    expect(parsed.relationship.properties.since).toBe(1999);
    expect(parsed.end.properties.age).toBe(41);
    expect(JSON.stringify(parsed)).not.toContain('"low"');
  });

  it("keeps the path length", () => {
    expect(parse(buildPath()).length).toBe(1);
  });

  // Same contract parsePrimitive already honours for #1304: beyond the safe
  // range a value becomes a lossless string, never a rounded number and never
  // a BigInt (JSON.stringify throws on those).
  it("renders a beyond-safe-range Integer inside a path as a string", () => {
    const big = new Node(
      int(1),
      ["Person"],
      { huge: neo4j.int("9007199254740993") },
      "node:1",
    );
    const other = new Node(int(2), ["Person"], {}, "node:2");
    const rel = new Relationship(
      int(10),
      int(1),
      int(2),
      "KNOWS",
      {},
      "rel:10",
      "node:1",
      "node:2",
    );

    const parsed = parse(
      new Path(big, other, [new PathSegment(big, rel, other)]),
    );
    expect(parsed.start.properties.huge).toBe("9007199254740993");
  });
});

/**
 * Guard against a second #1305. `isGraphObject` lists Node, Relationship,
 * Path, PathSegment and Point — but the driver also has UnboundRelationship,
 * which is NOT listed. Rather than assume that is a leak or assume it is fine,
 * this pins the actual behaviour: it falls through to the plain-object branch,
 * whose recursive convert handles it correctly.
 *
 * If a future driver version changes UnboundRelationship's shape so the
 * fallback stops converting it, this fails rather than shipping {low, high} to
 * a widget again.
 */
describe("Neo4jRecordParser - no other graph shape leaks Integers", () => {
  const parser = new Neo4jRecordParser();

  it("converts an UnboundRelationship even though isGraphObject omits it", () => {
    const { UnboundRelationship } = neo4j.types;
    const unbound = new UnboundRelationship(
      int(7),
      "KNOWS",
      { since: int(1999) },
      "rel:7",
    );

    const record = {
      keys: ["r"],
      get: (key: string) => (key === "r" ? unbound : undefined),
    } as any;
    const parsed = parser._parse(record)["r"] as Record<string, any>;

    expect(parsed.properties.since).toBe(1999);
    expect(parsed.identity).toBe(7);
    expect(JSON.stringify(parsed)).not.toContain('"low"');
  });
});
