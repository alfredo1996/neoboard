import { isInt, int, Date as Neo4jDate } from "neo4j-driver";
import { toNeo4jParams } from "../../src/neo4j/coerce-params";

/**
 * #1518 — a JS number reaches the driver as a Cypher Float, and `LIMIT` /
 * `SKIP` accept only an Integer. `LIMIT $param_x` was therefore rejected for
 * every value a user could supply:
 *
 *   LIMIT: Invalid input. '40.0' is not a valid value. Must be a non-negative
 *   integer.
 *
 * Integral numbers are converted; anything fractional must stay a Float, or a
 * `WHERE price > $param_min` against a float column would start truncating.
 */
describe("toNeo4jParams", () => {
  it("converts an integral number to a Neo4j Integer", () => {
    const out = toNeo4jParams({ limit: 40 });
    expect(isInt(out.limit)).toBe(true);
    expect((out.limit as ReturnType<typeof int>).toNumber()).toBe(40);
  });

  it("leaves a fractional number as a plain number", () => {
    const out = toNeo4jParams({ price: 4.5 });
    expect(isInt(out.price)).toBe(false);
    expect(out.price).toBe(4.5);
  });

  it("converts zero and negatives", () => {
    const out = toNeo4jParams({ zero: 0, neg: -7 });
    expect(isInt(out.zero)).toBe(true);
    expect(isInt(out.neg)).toBe(true);
    expect((out.neg as ReturnType<typeof int>).toNumber()).toBe(-7);
  });

  // Beyond 2^53 the JS number has already lost precision — converting would
  // hand Neo4j a confidently wrong integer. Left alone so the driver's own
  // handling applies rather than this helper inventing a value.
  it("leaves an unsafe integer alone", () => {
    const huge = 2 ** 53 + 1;
    const out = toNeo4jParams({ huge });
    expect(isInt(out.huge)).toBe(false);
    expect(out.huge).toBe(huge);
  });

  it("leaves non-finite numbers alone", () => {
    const out = toNeo4jParams({ nan: NaN, inf: Infinity });
    expect(isInt(out.nan)).toBe(false);
    expect(isInt(out.inf)).toBe(false);
  });

  it("does not touch strings, booleans, null or undefined", () => {
    const out = toNeo4jParams({
      s: "40",
      b: true,
      n: null,
      u: undefined,
    });
    expect(out).toEqual({ s: "40", b: true, n: null, u: undefined });
  });

  it("converts integers inside an array", () => {
    const out = toNeo4jParams({ ids: [1, 2.5, 3] });
    const ids = out.ids as unknown[];
    expect(isInt(ids[0])).toBe(true);
    expect(isInt(ids[1])).toBe(false);
    expect(isInt(ids[2])).toBe(true);
  });

  it("converts integers inside a nested plain object", () => {
    const out = toNeo4jParams({ range: { min: 1, max: 10.5 } });
    const range = out.range as Record<string, unknown>;
    expect(isInt(range.min)).toBe(true);
    expect(isInt(range.max)).toBe(false);
  });

  // Converting these would corrupt them — they are driver values, not data.
  it("leaves an existing Neo4j Integer untouched", () => {
    const already = int(5);
    const out = toNeo4jParams({ already });
    expect(out.already).toBe(already);
  });

  it("leaves temporal and Date values untouched", () => {
    const d = new Date("2024-01-02T03:04:05Z");
    const nd = new Neo4jDate(int(2024), int(1), int(2));
    const out = toNeo4jParams({ d, nd });
    expect(out.d).toBe(d);
    expect(out.nd).toBe(nd);
  });

  it("returns an empty object unchanged", () => {
    expect(toNeo4jParams({})).toEqual({});
  });
});
