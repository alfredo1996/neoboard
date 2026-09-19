/**
 * Connector result-shape conformance harness (#1904).
 *
 * The companion of `query-safety.ts`, for the other half of the contract: not
 * how a query runs, but what its rows hold. It is PURE — no database, no
 * driver, no network. A connector hands over a function that runs its record
 * parser on one raw value, plus raw values it builds itself (a driver `Node`,
 * a 64-bit integer, an interval), and each case asserts the parser emitted the
 * canonical form of `generalized/row-value.ts`.
 *
 * Each case's `run()` throws on violation, so a connector wires the cases into
 * its own jest/vitest/etc. — the SDK stays free of a test-framework dependency.
 *
 * Every fixture is checked three ways:
 *  1. JSON safety, at any depth: no `Date`, no BigInt, no function, no
 *     `undefined`, no non-finite number, no `{low, high}` integer, no class
 *     instance — and `JSON.parse(JSON.stringify(x))` deep-equals `x`.
 *  2. The canonical form of its kind (a `$type` tag, an ISO-8601 pattern, a
 *     decimal string for a number a double cannot hold).
 *  3. Equality with the fixture's `expected`, so the right form holding the
 *     wrong value still fails.
 */

import {
  isGraphNode,
  isGraphPath,
  isGraphRelationship,
} from "../generalized/row-value";
import type { RowValue } from "../generalized/row-value";

/** One raw driver value and the row value the parser must turn it into. */
export interface ShapeFixture<Raw = unknown> {
  raw: Raw;
  expected: RowValue;
}

type OneOrMany<T> = T | T[];

/**
 * Raw values per kind. `Raw` is whatever your `parse` needs — the driver value
 * itself, or the value plus its column type when parsing depends on it.
 *
 * The first six kinds are mandatory. Supply the others for every type your
 * database has; a kind it lacks is left out and its case is not generated. The
 * four graph kinds are mandatory when the connector declares
 * `supportsGraphData`, and ignored otherwise.
 */
export interface ShapeFixtures<Raw = unknown> {
  /** An integer a double holds exactly → `number`. */
  safeInteger: OneOrMany<ShapeFixture<Raw>>;
  /** An integer beyond ±(2^53 − 1) → decimal string, never rounded. */
  unsafeInteger: OneOrMany<ShapeFixture<Raw>>;
  /** → finite `number`. */
  float: OneOrMany<ShapeFixture<Raw>>;
  boolean: OneOrMany<ShapeFixture<Raw>>;
  /** Every way the driver says "no value" (`null`, `undefined`) → `null`. */
  nullish: OneOrMany<ShapeFixture<Raw>>;
  /** A list or map holding driver values at depth → array / plain object. */
  nested: OneOrMany<ShapeFixture<Raw>>;

  /** A decimal with more digits than a double holds → decimal string. */
  decimal?: OneOrMany<ShapeFixture<Raw>>;
  date?: OneOrMany<ShapeFixture<Raw>>;
  /** A date-time WITH an offset. */
  dateTime?: OneOrMany<ShapeFixture<Raw>>;
  /** A date-time with NO zone — must not gain one. */
  localDateTime?: OneOrMany<ShapeFixture<Raw>>;
  /** A time WITH an offset. */
  time?: OneOrMany<ShapeFixture<Raw>>;
  localTime?: OneOrMany<ShapeFixture<Raw>>;
  /** A duration or interval; include a negative and a mixed-sign one. */
  duration?: OneOrMany<ShapeFixture<Raw>>;

  node?: OneOrMany<ShapeFixture<Raw>>;
  relationship?: OneOrMany<ShapeFixture<Raw>>;
  /** A relationship the database returned without its endpoints. */
  relationshipWithoutEndpoints?: OneOrMany<ShapeFixture<Raw>>;
  path?: OneOrMany<ShapeFixture<Raw>>;
}

export interface ShapeConformanceOptions {
  /** The connector descriptor's `supportsGraphData`. */
  supportsGraphData?: boolean;
}

export interface ShapeConformanceCase {
  /** The fixture kind the case covers, e.g. `"duration"`. */
  name: string;
  run: () => void;
}

type Kind = keyof ShapeFixtures;
/** Returns what is wrong with `value`, or undefined when it conforms. */
type Check = (value: unknown) => string | undefined;

const DATE = String.raw`[+-]?\d{4,6}-\d{2}-\d{2}`;
const TIME = String.raw`\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?`;
const OFFSET = String.raw`(?:Z|[+-]\d{2}:\d{2})`;
const DURATION = String.raw`P(?=-?\d|T)(?:-?\d+Y)?(?:-?\d+M)?(?:-?\d+D)?(?:T(?=-?\d)(?:-?\d+H)?(?:-?\d+M)?(?:-?\d+(?:\.\d{1,9})?S)?)?`;

const show = (value: unknown) =>
  typeof value === "bigint"
    ? `${value}n`
    : (JSON.stringify(value) ?? String(value));

const matches =
  (pattern: string, what: string): Check =>
  (value) =>
    typeof value === "string" && new RegExp(`^${pattern}$`).test(value)
      ? undefined
      : `expected ${what}, got ${show(value)}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const isId = (value: unknown) =>
  typeof value === "string" || typeof value === "number";

const ENDPOINT_KEYS = [
  "start",
  "startNodeElementId",
  "end",
  "endNodeElementId",
] as const;

function checkNode(value: unknown, at = "value"): string | undefined {
  if (!isGraphNode(value)) return `${at} must carry $type: "node"`;
  if (!isId(value.identity)) return `${at}.identity must be a string or number`;
  if (typeof value.elementId !== "string")
    return `${at}.elementId must be a string`;
  if (!Array.isArray(value.labels)) return `${at}.labels must be an array`;
  if (!isPlainObject(value.properties))
    return `${at}.properties must be a plain object`;
  return undefined;
}

function checkRelationshipCore(value: unknown, at: string): string | undefined {
  if (!isGraphRelationship(value))
    return `${at} must carry $type: "relationship"`;
  if (!isId(value.identity)) return `${at}.identity must be a string or number`;
  if (typeof value.elementId !== "string")
    return `${at}.elementId must be a string`;
  if (typeof value.type !== "string") return `${at}.type must be a string`;
  if (!isPlainObject(value.properties))
    return `${at}.properties must be a plain object`;
  return undefined;
}

function checkRelationship(value: unknown, at = "value"): string | undefined {
  const core = checkRelationshipCore(value, at);
  if (core) return core;
  const rel = value as Record<string, unknown>;
  const missing = ENDPOINT_KEYS.find((key) => rel[key] == null);
  return missing && `${at}.${missing} is missing`;
}

function checkUnboundRelationship(value: unknown): string | undefined {
  const core = checkRelationshipCore(value, "value");
  if (core) return core;
  const present = ENDPOINT_KEYS.find((key) => key in (value as object));
  return present && `value.${present} must be absent, not null or undefined`;
}

function checkPath(value: unknown): string | undefined {
  if (!isGraphPath(value)) return 'value must carry $type: "path"';
  if (!Array.isArray(value.segments)) return "value.segments must be an array";
  if (value.length !== value.segments.length)
    return "value.length must equal the number of segments";
  const hops = value.segments.flatMap((segment, i) => [
    checkNode(segment.start, `value.segments[${i}].start`),
    checkRelationship(
      segment.relationship,
      `value.segments[${i}].relationship`,
    ),
    checkNode(segment.end, `value.segments[${i}].end`),
  ]);
  return [
    checkNode(value.start, "value.start"),
    checkNode(value.end, "value.end"),
    ...hops,
  ].find(Boolean);
}

const FORM: Record<Kind, Check> = {
  safeInteger: (v) =>
    Number.isSafeInteger(v)
      ? undefined
      : `expected a safe integer, got ${show(v)}`,
  unsafeInteger: matches(String.raw`-?\d+`, "a decimal string"),
  float: (v) =>
    typeof v === "number" ? undefined : `expected a number, got ${show(v)}`,
  boolean: (v) =>
    typeof v === "boolean" ? undefined : `expected a boolean, got ${show(v)}`,
  nullish: (v) => (v === null ? undefined : `expected null, got ${show(v)}`),
  nested: (v) =>
    Array.isArray(v) || isPlainObject(v)
      ? undefined
      : `expected an array or a plain object, got ${show(v)}`,
  decimal: matches(String.raw`-?\d+(?:\.\d+)?`, "a decimal string"),
  date: matches(DATE, "YYYY-MM-DD"),
  dateTime: matches(`${DATE}T${TIME}${OFFSET}`, "an ISO date-time with offset"),
  localDateTime: matches(`${DATE}T${TIME}`, "an ISO date-time with no offset"),
  time: matches(`${TIME}${OFFSET}`, "an ISO time with offset"),
  localTime: matches(TIME, "an ISO time with no offset"),
  duration: matches(DURATION, "an ISO-8601 duration"),
  node: (v) => checkNode(v),
  relationship: (v) => checkRelationship(v),
  relationshipWithoutEndpoints: checkUnboundRelationship,
  path: checkPath,
};

const MANDATORY: Kind[] = [
  "safeInteger",
  "unsafeInteger",
  "float",
  "boolean",
  "nullish",
  "nested",
];
const OPTIONAL: Kind[] = [
  "decimal",
  "date",
  "dateTime",
  "localDateTime",
  "time",
  "localTime",
  "duration",
];
const GRAPH: Kind[] = [
  "node",
  "relationship",
  "relationshipWithoutEndpoints",
  "path",
];

/** What JSON cannot carry, for a value that is not a container. */
function unsafeLeaf(value: unknown): string | undefined {
  switch (typeof value) {
    case "bigint":
      return "a BigInt (JSON.stringify throws on it)";
    case "function":
    case "symbol":
      return `a ${typeof value}`;
    case "undefined":
      return "undefined (use null)";
    case "number":
      return Number.isFinite(value)
        ? undefined
        : `${value}, which is not finite (JSON turns it into null)`;
    default:
      return undefined;
  }
}

/** What JSON would mangle, for an object that is not a plain container. */
function unsafeObject(value: object): string | undefined {
  if (value instanceof Date) return "a Date (emit an ISO string)";
  if (Array.isArray(value)) return undefined;
  if (!isPlainObject(value))
    return `a live ${value.constructor?.name ?? "object"} instance`;
  const keys = Object.keys(value);
  const isDriverInteger =
    keys.length === 2 &&
    typeof value.low === "number" &&
    typeof value.high === "number";
  return isDriverInteger ? "a {low, high} driver integer" : undefined;
}

/** First JSON-unsafe value at any depth, as "<what> at <path>". */
function findUnsafe(value: unknown, path: string): string | undefined {
  if (typeof value !== "object" || value === null) {
    const leaf = unsafeLeaf(value);
    return leaf && `${leaf} at ${path}`;
  }
  const own = unsafeObject(value);
  if (own) return `${own} at ${path}`;
  const children: [string, unknown][] = Array.isArray(value)
    ? // Array.from, not map: map skips a hole, from reads it as undefined.
      Array.from(value, (item, i) => [`${path}[${i}]`, item])
    : Object.entries(value).map(([k, v]) => [`${path}.${k}`, v]);
  for (const [childPath, child] of children) {
    const found = findUnsafe(child, childPath);
    if (found) return found;
  }
  return undefined;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => Object.hasOwn(right, k) && sameJson(left[k], right[k]))
  );
}

function violation(
  kind: Kind,
  actual: unknown,
  expected: RowValue,
): string | undefined {
  const unsafe = findUnsafe(actual, "value");
  if (unsafe) return `found ${unsafe}`;
  if (!sameJson(JSON.parse(JSON.stringify(actual)), actual))
    return `${show(actual)} does not survive a JSON round trip`;
  const form = FORM[kind](actual);
  if (form) return form;
  return sameJson(actual, expected)
    ? undefined
    : `expected ${show(expected)}, got ${show(actual)}`;
}

/**
 * Build the result-shape conformance cases for a connector's record parser.
 *
 * `parse` runs the parser on ONE raw value and returns what would land in the
 * row. Cases come back in a fixed order — mandatory kinds, then the optional
 * kinds that have a fixture, then the graph kinds when `supportsGraphData` —
 * so a connector can pin the list and notice a case going missing.
 *
 * Throws at build time when a mandatory fixture is absent.
 */
export function buildShapeConformanceCases<Raw>(
  parse: (raw: Raw) => unknown,
  fixtures: ShapeFixtures<Raw>,
  options: ShapeConformanceOptions = {},
): ShapeConformanceCase[] {
  const graph = options.supportsGraphData ? GRAPH : [];
  for (const kind of [...MANDATORY, ...graph]) {
    if (fixtures[kind] !== undefined) continue;
    throw new Error(
      graph.includes(kind)
        ? `shape conformance: supportsGraphData is declared but fixtures.${kind} is missing`
        : `shape conformance: fixtures.${kind} is mandatory`,
    );
  }

  return [...MANDATORY, ...OPTIONAL, ...graph]
    .filter((kind) => fixtures[kind] !== undefined)
    .map((kind) => ({
      name: kind,
      run: () => runFixtures(kind, parse, [fixtures[kind]!].flat()),
    }));
}

/** Every fixture of one kind; throws on the first that violates the contract. */
function runFixtures<Raw>(
  kind: Kind,
  parse: (raw: Raw) => unknown,
  given: ShapeFixture<Raw>[],
): void {
  for (const { raw, expected } of given) {
    const problem = violation(kind, parse(raw), expected);
    if (problem) throw new Error(`shape violation (${kind}): ${problem}`);
  }
}
