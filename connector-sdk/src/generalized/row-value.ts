/**
 * The row value contract (#1904): what a connector may put in a result row.
 *
 * NeoBoard is one dashboard over many systems, so nothing downstream may ask
 * which connector produced a value. Every connector's record parser
 * normalises what its driver returns into the forms below, and consumers key
 * on the form alone. A row crosses JSON on its way to the browser, so every
 * value must survive `JSON.parse(JSON.stringify(value))` unchanged: no live
 * driver object, no `Date`, no `BigInt`, no `undefined`, no function.
 *
 * | Kind                | Canonical form                                         |
 * | ------------------- | ------------------------------------------------------ |
 * | missing             | `null` (never `undefined`)                             |
 * | boolean, string     | as is                                                  |
 * | integer             | `number` inside ±(2^53 − 1), else a decimal string     |
 * | decimal             | `number` when a double holds it exactly, else a string |
 * | float               | finite `number`                                        |
 * | date                | `YYYY-MM-DD`                                           |
 * | date-time           | `YYYY-MM-DDTHH:mm:ss[.f…]` + `Z` or `±HH:MM`           |
 * | local date-time     | `YYYY-MM-DDTHH:mm:ss[.f…]`, no offset                  |
 * | time                | `HH:mm:ss[.f…]` + `Z` or `±HH:MM`                      |
 * | local time          | `HH:mm:ss[.f…]`                                        |
 * | duration / interval | ISO-8601 duration — see {@link toIsoDuration}          |
 * | graph value         | {@link GraphNode}, {@link GraphRelationship}, {@link GraphPath} — tagged with `$type` |
 * | list                | array of row values                                    |
 * | map / document      | plain object of row values                             |
 *
 * A lossy number is a STRING, never rounded and never a `BigInt` (on which
 * `JSON.stringify` throws). A value with no zone stays zone-less: presenting a
 * local date-time as an instant moves it by the server's offset. A named time
 * zone is dropped and its offset kept, because `[Europe/Rome]` is not ISO-8601
 * and `Date.parse` rejects it.
 *
 * Column names are the database's own; a connector never rewrites them.
 *
 * `buildShapeConformanceCases` (conformance/result-shapes.ts) checks a parser
 * against this contract with no database.
 */
export type RowValue =
  | string
  | number
  | boolean
  | null
  | GraphValue
  | RowValue[]
  | { [key: string]: RowValue };

/** One result row: column name → value. */
export type Row = Record<string, RowValue>;

/**
 * A graph node. `identity` and `elementId` both identify it; a database with
 * one id sets `elementId` to its string form.
 */
export interface GraphNode {
  $type: "node";
  identity: number | string;
  elementId: string;
  labels: string[];
  properties: { [key: string]: RowValue };
}

/**
 * A graph relationship. The four endpoint keys are ABSENT — not `null`, not
 * `undefined` — on a relationship the database returned without its endpoints.
 */
export interface GraphRelationship {
  $type: "relationship";
  identity: number | string;
  elementId: string;
  type: string;
  properties: { [key: string]: RowValue };
  start?: number | string;
  startNodeElementId?: string;
  end?: number | string;
  endNodeElementId?: string;
}

/** One hop of a {@link GraphPath}. Needs no tag: it only occurs inside one. */
export interface GraphPathSegment {
  start: GraphNode;
  relationship: GraphRelationship;
  end: GraphNode;
}

export interface GraphPath {
  $type: "path";
  start: GraphNode;
  end: GraphNode;
  segments: GraphPathSegment[];
  /** Number of segments. */
  length: number;
}

export type GraphValue = GraphNode | GraphRelationship | GraphPath;

function tagOf(value: unknown): unknown {
  return typeof value === "object" && value !== null
    ? (value as { $type?: unknown }).$type
    : undefined;
}

// The guards read the tag and nothing else. Guessing from key names is what
// made a JSON column holding `labels` and `properties` render as a graph.

export function isGraphNode(value: unknown): value is GraphNode {
  return tagOf(value) === "node";
}

export function isGraphRelationship(
  value: unknown,
): value is GraphRelationship {
  return tagOf(value) === "relationship";
}

export function isGraphPath(value: unknown): value is GraphPath {
  return tagOf(value) === "path";
}

/**
 * A 64-bit integer as a row value: a `number` when a double holds it exactly,
 * otherwise its decimal string.
 */
export function integerToRowValue(value: bigint): number | string {
  return value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER
    ? Number(value)
    : value.toString();
}

/** The four independent quantities of a duration, each a signed integer. */
export interface DurationParts {
  months: number | bigint;
  days: number | bigint;
  seconds: number | bigint;
  nanoseconds: number | bigint;
}

const NANOS_PER_SECOND = 1_000_000_000n;

const unit = (value: bigint, designator: string) =>
  value === 0n ? "" : `${value}${designator}`;

/**
 * An ISO-8601 duration, the one form every connector emits for a duration or
 * interval: `P[nY][nM][nD][T[nH][nM][n[.f]S]]`.
 *
 * - Exact carries only: 12 months are a year, 3600 seconds an hour, 60 a
 *   minute. Days never become hours (a day is not 24 hours across a DST
 *   change) and months never become days. Weeks are not used.
 * - A zero component is omitted; a zero duration is `PT0S`.
 * - `seconds` and `nanoseconds` are ONE signed quantity — a driver may hold
 *   −1.5 s as −2 s plus 500 000 000 ns. Up to nine fraction digits, trailing
 *   zeros trimmed.
 * - Sign: every non-zero component carries its own, so a negative duration is
 *   `P-1Y-2M-3DT-4H-5M-6S` and a mixed one `P1M-2DT3S`. That is what both
 *   PostgreSQL (`intervalstyle = iso_8601`) and Cypher print, and the only
 *   single rule that can express mixed signs. There is never a leading `-P`.
 *
 * Arithmetic is BigInt throughout, so the result is exact at any magnitude.
 * Each part must be an integer; a fraction throws.
 */
export function toIsoDuration(parts: DurationParts): string {
  const months = BigInt(parts.months);
  const nanos =
    BigInt(parts.seconds) * NANOS_PER_SECOND + BigInt(parts.nanoseconds);
  const sign = nanos < 0n ? "-" : "";
  const abs = nanos < 0n ? -nanos : nanos;

  const wholeSeconds = abs / NANOS_PER_SECOND;
  // Trailing zeros are trimmed by hand rather than with `/0+$/`: that pattern
  // backtracks super-linearly, and a nine-digit input is cheaper to walk.
  let digits = (abs % NANOS_PER_SECOND).toString().padStart(9, "0");
  while (digits.endsWith("0")) digits = digits.slice(0, -1);
  const fraction = digits && `.${digits}`;
  const seconds = `${wholeSeconds % 60n}${fraction}`;

  const date =
    unit(months / 12n, "Y") +
    unit(months % 12n, "M") +
    unit(BigInt(parts.days), "D");
  const time = [
    unit(wholeSeconds / 3600n, "H"),
    unit((wholeSeconds / 60n) % 60n, "M"),
    seconds === "0" ? "" : `${seconds}S`,
  ]
    .map((part) => part && sign + part)
    .join("");

  if (!date && !time) return "PT0S";
  const timePart = time && `T${time}`;
  return `P${date}${timePart}`;
}
