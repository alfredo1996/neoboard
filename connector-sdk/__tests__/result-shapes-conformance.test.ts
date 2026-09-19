import { buildShapeConformanceCases } from "../src/conformance/result-shapes";
import type { ShapeFixtures } from "../src/conformance/result-shapes";
import type { RowValue } from "../src/generalized/row-value";

/**
 * The shape harness's own negative controls, in the manner of #1631.
 *
 * `result-shapes.ts` is the contract every connector's record parser runs to
 * prove what it emits. A case that stops rejecting its fake below has stopped
 * being a contract — and would pass every connector in silence.
 *
 * The fake "driver" hands out opaque keys; the fake parser looks the canonical
 * value up. Each negative control swaps exactly one entry for a leak.
 */

const person = {
  $type: "node" as const,
  identity: 1,
  elementId: "n:1",
  labels: ["Person"],
  properties: { age: 30 },
};
const friend = { ...person, identity: 2, elementId: "n:2" };
const knows = {
  $type: "relationship" as const,
  identity: 10,
  elementId: "r:10",
  start: 1,
  startNodeElementId: "n:1",
  end: 2,
  endNodeElementId: "n:2",
  type: "KNOWS",
  properties: { since: 1999 },
};

const canonical: Record<string, RowValue> = {
  safeInteger: 42,
  unsafeInteger: "9007199254740993",
  decimal: "0.12345678901234567890",
  float: 1.5,
  boolean: true,
  nullish: null,
  nested: [{ ids: [1, "9007199254740993"], when: "2024-06-01" }],
  date: "2024-06-01",
  dateTime: "2024-06-01T14:30:05.123456789+02:00",
  localDateTime: "2024-06-01T14:30:05",
  time: "14:30:05.5+02:00",
  localTime: "14:30:05",
  duration: "P1M-2DT3.5S",
  node: person,
  relationship: knows,
  relationshipWithoutEndpoints: {
    $type: "relationship",
    identity: 10,
    elementId: "r:10",
    type: "KNOWS",
    properties: {},
  },
  path: {
    $type: "path",
    start: person,
    end: friend,
    segments: [{ start: person, relationship: knows, end: friend }],
    length: 1,
  },
};

/** Every kind, keyed by its own name: `raw` is the key, `expected` the value. */
const fixtures = Object.fromEntries(
  Object.entries(canonical).map(([kind, expected]) => [
    kind,
    { raw: kind, expected },
  ]),
) as unknown as ShapeFixtures<string>;

/** A parser that emits the canonical value, except where `leaks` says otherwise. */
const parserLeaking =
  (leaks: Record<string, unknown> = {}) =>
  (raw: string): unknown =>
    raw in leaks ? leaks[raw] : canonical[raw];

const caseNamed = (
  needle: string,
  leaks?: Record<string, unknown>,
  given: ShapeFixtures<string> = fixtures,
) => {
  const found = buildShapeConformanceCases(parserLeaking(leaks), given, {
    supportsGraphData: true,
  }).find((c) => c.name === needle);
  if (!found) throw new Error(`no shape conformance case named "${needle}"`);
  return found;
};

describe("result-shape conformance harness", () => {
  it("registers exactly the documented cases for a graph connector", () => {
    const names = buildShapeConformanceCases(parserLeaking(), fixtures, {
      supportsGraphData: true,
    }).map((c) => c.name);
    expect(names).toEqual([
      "safeInteger",
      "unsafeInteger",
      "float",
      "boolean",
      "nullish",
      "nested",
      "decimal",
      "date",
      "dateTime",
      "localDateTime",
      "time",
      "localTime",
      "duration",
      "node",
      "relationship",
      "relationshipWithoutEndpoints",
      "path",
    ]);
  });

  it("registers no graph case unless the connector declares supportsGraphData", () => {
    const names = buildShapeConformanceCases(parserLeaking(), fixtures).map(
      (c) => c.name,
    );
    expect(names).not.toContain("node");
    expect(names).not.toContain("path");
    expect(names).toContain("duration");
  });

  it("skips a kind the database does not have", () => {
    const { decimal: _decimal, time: _time, ...withoutSome } = fixtures;
    const names = buildShapeConformanceCases(parserLeaking(), withoutSome).map(
      (c) => c.name,
    );
    expect(names).not.toContain("decimal");
    expect(names).not.toContain("time");
    expect(names).toContain("date");
  });

  it("refuses a graph connector that supplies no graph fixtures", () => {
    const { node: _node, ...withoutNode } = fixtures;
    expect(() =>
      buildShapeConformanceCases(parserLeaking(), withoutNode, {
        supportsGraphData: true,
      }),
    ).toThrow(/supportsGraphData.*node/);
  });

  it("refuses a missing mandatory fixture", () => {
    const { nullish: _nullish, ...withoutNullish } = fixtures;
    expect(() =>
      buildShapeConformanceCases(
        parserLeaking(),
        withoutNullish as ShapeFixtures<string>,
      ),
    ).toThrow(/nullish/);
  });

  it("passes a conforming parser on every case", () => {
    const cases = buildShapeConformanceCases(parserLeaking(), fixtures, {
      supportsGraphData: true,
    });
    for (const c of cases) expect(() => c.run()).not.toThrow();
  });

  it("runs every fixture of a list, not just the first", () => {
    const c = caseNamed(
      "nullish",
      { second: undefined },
      {
        ...fixtures,
        nullish: [
          { raw: "nullish", expected: null },
          { raw: "second", expected: null },
        ],
      },
    );
    expect(() => c.run()).toThrow(/shape violation \(nullish\)/);
  });

  describe("negative controls", () => {
    it("rejects a parser that leaks a {low, high} integer", () => {
      const c = caseNamed("safeInteger", { safeInteger: { low: 42, high: 0 } });
      expect(() => c.run()).toThrow(/\{low, high\}/);
    });

    it("rejects a {low, high} integer buried in a nested value", () => {
      const c = caseNamed("nested", {
        nested: [{ ids: [{ low: 1, high: 0 }], when: "2024-06-01" }],
      });
      expect(() => c.run()).toThrow(/\{low, high\}.*\[0\]\.ids\[0\]/);
    });

    it("rejects a parser that leaks a Date", () => {
      const c = caseNamed("dateTime", {
        dateTime: new Date("2024-06-01T12:30:05.123Z"),
      });
      expect(() => c.run()).toThrow(/Date/);
    });

    it("rejects a parser that leaks an untagged node", () => {
      const { $type: _tag, ...untagged } = person;
      const c = caseNamed("node", { node: untagged });
      expect(() => c.run()).toThrow(/\$type/);
    });

    it("rejects a parser that leaks a BigInt", () => {
      const c = caseNamed("unsafeInteger", {
        unsafeInteger: 9007199254740993n,
      });
      expect(() => c.run()).toThrow(/BigInt/);
    });

    it("rejects a rounded integer", () => {
      // 2^53 + 1 as a double is 2^53: plausible, and wrong.
      const c = caseNamed("unsafeInteger", {
        unsafeInteger: 9007199254740992,
      });
      expect(() => c.run()).toThrow(/decimal string/);
    });

    it("rejects an undefined cell", () => {
      const c = caseNamed("nullish", { nullish: undefined });
      expect(() => c.run()).toThrow(/undefined/);
    });

    it("rejects a function and a live class instance", () => {
      class DriverThing {
        value = 1;
      }
      expect(() => caseNamed("nested", { nested: [() => 1] }).run()).toThrow(
        /function/,
      );
      expect(() =>
        caseNamed("nested", { nested: [new DriverThing()] }).run(),
      ).toThrow(/DriverThing/);
    });

    it("rejects a non-finite number, which JSON turns into null", () => {
      const c = caseNamed("float", { float: Number.POSITIVE_INFINITY });
      expect(() => c.run()).toThrow(/finite/);
    });

    it.each([
      ["date", "2024-06-01T00:00:00.000Z"],
      ["dateTime", "2024-06-01 14:30:05"],
      ["dateTime", "2024-06-01T14:30:05[Europe/Rome]"],
      ["localDateTime", "2024-06-01T14:30:05Z"],
      ["time", "14:30:05+02"],
      ["localTime", "14:5:3.4"],
      ["duration", "1 mon 2 days"],
      ["duration", "P"],
      ["duration", "P1DT"],
    ])("rejects a %s that reads %p", (kind, leaked) => {
      const c = caseNamed(kind, { [kind]: leaked });
      expect(() => c.run()).toThrow(
        new RegExp(String.raw`shape violation \(${kind}\)`),
      );
    });

    it.each([
      ["node", { ...person, identity: { low: 1 } }, /identity/],
      ["node", { ...person, elementId: 1 }, /elementId/],
      ["node", { ...person, labels: "Person" }, /labels/],
      ["node", { ...person, properties: [] }, /properties/],
      ["relationship", { ...knows, identity: null }, /identity/],
      ["relationship", { ...knows, elementId: 10 }, /elementId/],
      ["relationship", { ...knows, type: 7 }, /type/],
      ["relationship", { ...knows, properties: "none" }, /properties/],
      ["path", { ...(canonical.path as object), length: 2 }, /length/],
      ["path", { ...(canonical.path as object), segments: null }, /segments/],
    ])("rejects a %s with a malformed field (%#)", (kind, leaked, message) => {
      expect(() => caseNamed(kind, { [kind]: leaked }).run()).toThrow(message);
    });

    it("rejects a hole in an array, which JSON turns into null", () => {
      const sparse: unknown[] = [1, 2, 3];
      delete sparse[1];
      const c = caseNamed("nested", { nested: sparse });
      expect(() => c.run()).toThrow(/undefined.*value\[1\]/);
    });

    it("rejects a value that JSON would rewrite", () => {
      // An array carrying own properties — a RegExp match with its `index` —
      // passes every per-value check and still arrives without them. The
      // round trip is the backstop for whatever the walk cannot see.
      const c = caseNamed("nested", {
        nested: Object.assign(["a", "b"], { index: 0 }),
      });
      expect(() => c.run()).toThrow(/JSON round trip/);
    });

    it("rejects a relationship that lost an endpoint", () => {
      const { endNodeElementId: _end, ...oneEnded } = knows;
      const c = caseNamed("relationship", { relationship: oneEnded });
      expect(() => c.run()).toThrow(/endNodeElementId/);
    });

    it("rejects an endpoint key on a relationship returned without endpoints", () => {
      // `start: undefined` still makes `"start" in value` true, which is how a
      // key-sniffing consumer would draw an edge to the node "undefined".
      const c = caseNamed("relationshipWithoutEndpoints", {
        relationshipWithoutEndpoints: knows,
      });
      expect(() => c.run()).toThrow(/must be absent/);
    });

    it("rejects a path whose segments hold an untagged node", () => {
      const { $type: _tag, ...untagged } = person;
      const path = canonical.path as Record<string, unknown>;
      const c = caseNamed("path", {
        path: {
          ...path,
          segments: [{ start: untagged, relationship: knows, end: friend }],
        },
      });
      expect(() => c.run()).toThrow(/segments\[0\]\.start/);
    });

    it("rejects a canonical value that is not the one the fixture expects", () => {
      // Right form, wrong day: the form checks alone would let it through.
      const c = caseNamed("date", { date: "2024-05-31" });
      expect(() => c.run()).toThrow(/expected "2024-06-01"/);
    });
  });
});
