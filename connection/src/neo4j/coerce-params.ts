import { int, isInt } from "neo4j-driver";

/**
 * True for an object literal or `Object.create(null)` — not a class instance.
 *
 * The distinction matters: the driver's own values (Integer, Date, DateTime,
 * Point, Node…) are class instances carrying internal state. Walking into them
 * and rebuilding their fields would corrupt them, so recursion stops at
 * anything with a prototype of its own.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Convert integral JavaScript numbers to Neo4j Integers, recursively.
 *
 * `neo4j-driver` maps a JS `number` to a Cypher **Float** and reserves Integer
 * for values built with `int()`. Cypher's `LIMIT` and `SKIP` accept only an
 * Integer, so `LIMIT $param_x` was rejected for every value a user could
 * supply — `'40.0' is not a valid value` (#1518). JSON has one number type, so
 * no caller could work around it.
 *
 * Only *integral* numbers convert. A fractional value must stay a Float, or a
 * `WHERE price > $param_min` against a float column would start truncating —
 * and `int()` throws on a non-integer anyway. An integral Float and an Integer
 * compare equal in Cypher, so widening the integral case is safe for
 * comparisons while making LIMIT/SKIP reachable.
 *
 * `Number.isSafeInteger`, not `Number.isInteger`: past 2^53 the JS number has
 * already lost precision, so converting would hand Neo4j a confidently wrong
 * integer. Those are left for the driver to handle rather than guessed at here.
 * This is the inbound counterpart to the outbound `inSafeRange()` check in
 * `Neo4jRecordParser.parsePrimitive` (#1304).
 */
function coerce(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? int(value) : value;
  }
  // Already a driver Integer — nothing to do, and rebuilding it would be wrong.
  if (isInt(value)) return value;
  if (Array.isArray(value)) return value.map(coerce);
  if (isPlainObject(value)) return toNeo4jParams(value);
  return value;
}

/** Apply {@link coerce} to every value of a parameter map. */
export function toNeo4jParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = coerce(value);
  }
  return out;
}
