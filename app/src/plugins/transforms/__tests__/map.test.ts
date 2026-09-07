import { describe, it, expect } from "vitest";
import { transformToMapData, validateMapData } from "../../map/transform";

type Marker = { id: string; lat: number; lng: number; label?: string };
const markers = (out: unknown) => out as Marker[];

describe("transformToMapData — picking the coordinate columns", () => {
  it("does not mistake population for latitude", () => {
    // "population" contains "lat" and the old substring regex took the first
    // key that matched, so a perfectly well-named query silently plotted
    // population against longitude.
    const out = markers(
      transformToMapData([
        {
          name: "Paris",
          population: 2_100_000,
          latitude: 48.85,
          longitude: 2.35,
        },
      ]),
    );
    expect(out[0].lat).toBeCloseTo(48.85);
    expect(out[0].lng).toBeCloseTo(2.35);
  });

  it("does not mistake colony or belongs for longitude", () => {
    // Both contain "lon" and matched /lo?ng?/i.
    const out = markers(
      transformToMapData([
        { colony: "yes", belongs: "FR", lat: 48.85, lng: 2.35 },
      ]),
    );
    expect(out[0].lng).toBeCloseTo(2.35);
  });

  it("reads a Cypher column that was never aliased", () => {
    // `RETURN c.latitude` names the column "c.latitude". Anchoring the match
    // to the whole key would reject it, and the demo dataset's City nodes
    // carry exactly these properties — alongside a `population` that the old
    // substring regex would have grabbed first.
    const out = markers(
      transformToMapData([
        {
          "c.name": "Miami",
          "c.population": 478_251,
          "c.latitude": 25.76,
          "c.longitude": -80.19,
        },
      ]),
    );
    expect(out[0].lat).toBeCloseTo(25.76);
    expect(out[0].lng).toBeCloseTo(-80.19);
    expect(out[0].label).toBe("Miami");
  });

  it("accepts every spelling of the coordinate columns", () => {
    for (const [latKey, lngKey] of [
      ["lat", "lng"],
      ["latitude", "longitude"],
      ["LAT", "LON"],
      ["Latitude", "Long"],
    ]) {
      const out = markers(transformToMapData([{ [latKey]: 10, [lngKey]: 20 }]));
      expect(out[0].lat, `${latKey}/${lngKey}`).toBe(10);
      expect(out[0].lng, `${latKey}/${lngKey}`).toBe(20);
    }
  });
});

describe("transformToMapData — reading the coordinate values", () => {
  it("does not put a missing coordinate on Null Island", () => {
    // Number(null) is 0, so a row with no latitude landed in the Gulf of
    // Guinea rather than being skipped.
    const out = markers(
      transformToMapData([{ name: "Unknown", lat: null, lng: null }]),
    );
    expect(Number.isNaN(out[0].lat)).toBe(true);
    expect(Number.isNaN(out[0].lng)).toBe(true);
  });

  it("does the same for an empty string", () => {
    const out = markers(transformToMapData([{ lat: "", lng: "  " }]));
    expect(Number.isNaN(out[0].lat)).toBe(true);
    expect(Number.isNaN(out[0].lng)).toBe(true);
  });

  it("keeps a coordinate that arrives as a numeric string", () => {
    // node-pg returns NUMERIC as a string. The old row prefilter demanded at
    // least one JS number in the row, so a PostgreSQL result of two NUMERIC
    // columns produced no markers at all.
    const out = markers(
      transformToMapData([{ name: "Oslo", lat: "59.91", lng: "10.75" }]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].lat).toBeCloseTo(59.91);
    expect(out[0].lng).toBeCloseTo(10.75);
  });

  it("emits NaN for a non-numeric coordinate (#1288)", () => {
    const out = markers(
      transformToMapData([
        { lat: "unknown", lng: -74.006, population: 8_000_000 },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(Number.isNaN(out[0].lat)).toBe(true);
    expect(out[0].lng).toBeCloseTo(-74.006);
  });

  it("rejects a non-finite number", () => {
    const out = markers(transformToMapData([{ lat: Infinity, lng: 2 }]));
    expect(Number.isNaN(out[0].lat)).toBe(true);
  });

  it("carries the raw row so a click action can name any column", () => {
    const row = { name: "Oslo", lat: 59.91, lng: 10.75, sales: 42 };
    const out = transformToMapData([row]) as Array<{
      properties: Record<string, unknown>;
    }>;
    expect(out[0].properties).toEqual(row);
  });

  it("returns an empty array when there is no coordinate pair", () => {
    expect(transformToMapData([{ name: "City", value: 42 }])).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(transformToMapData([])).toEqual([]);
  });
});

describe("validateMapData", () => {
  it("returns null for empty data", () => {
    expect(validateMapData([])).toBeNull();
  });

  it("names the columns it got when no pair resolves", () => {
    const err = validateMapData([{ name: "City", value: 42 }]);
    expect(err).toContain("name, value");
  });

  it("no longer passes a result whose only match was a substring", () => {
    // population/colony resolved under the old regexes, so validate said the
    // data was fine and the map then plotted the wrong columns.
    expect(validateMapData([{ population: 1, colony: 2 }])).toBeTruthy();
  });

  it("passes a real coordinate pair", () => {
    expect(validateMapData([{ latitude: 1, longitude: 2 }])).toBeNull();
  });
});
