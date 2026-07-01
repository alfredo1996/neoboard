import { extractNodeAndRelPropertiesFromRecords } from "../utils";

/**
 * Minimal stand-in for a neo4j-driver Record. The public Record API is
 * `keys` + `get(key)`; the implementation must NOT reach into the private
 * `_fields` array (#996 / #1116 reach-in fix).
 */
function fakeRecord(fields: Record<string, unknown>) {
  return {
    keys: Object.keys(fields),
    get: (key: string) => fields[key],
  };
}

describe("extractNodeAndRelPropertiesFromRecords", () => {
  it("collects node properties grouped by label via the public Record API", () => {
    const node = {
      labels: ["Person"],
      identity: 1,
      properties: { name: "Ada", age: 36 },
    };
    const result = extractNodeAndRelPropertiesFromRecords([
      fakeRecord({ n: node }),
    ]);
    expect(result).toEqual([["Person", "name", "age"]]);
  });

  it("collects relationship properties keyed by type", () => {
    const rel = {
      type: "KNOWS",
      start: 1,
      end: 2,
      identity: 9,
      properties: { since: 2020 },
    };
    const result = extractNodeAndRelPropertiesFromRecords([
      fakeRecord({ r: rel }),
    ]);
    expect(result).toEqual([["KNOWS", "since"]]);
  });

  it("walks path segments, collecting start/end node properties", () => {
    const start = {
      labels: ["A"],
      identity: 1,
      properties: { p: 1 },
    };
    const end = { labels: ["B"], identity: 2, properties: { q: 2 } };
    const path = {
      start,
      end,
      length: 1,
      segments: [{ start, end }],
    };
    const result = extractNodeAndRelPropertiesFromRecords([
      fakeRecord({ path }),
    ]);
    expect(result).toEqual([
      ["A", "p"],
      ["B", "q"],
    ]);
  });

  it("returns [] when records hold no graph values", () => {
    expect(
      extractNodeAndRelPropertiesFromRecords([fakeRecord({ x: 1, y: "two" })]),
    ).toEqual([]);
  });
});
