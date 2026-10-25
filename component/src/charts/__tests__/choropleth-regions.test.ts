import { describe, it, expect } from "vitest";
import world from "../world.geo.json";
import { buildRegionIndex, matchRegions } from "../choropleth-regions";

const index = buildRegionIndex(world.features);

describe("choropleth regions (#2230)", () => {
  it("ships Natural Earth with ISO codes, Antarctica and no nameless shape", () => {
    const names = world.features.map((f) => f.properties.name);
    expect(names).toContain("Antarctica");
    expect(names.every(Boolean)).toBe(true);
    expect(
      world.features.find((f) => f.properties.name === "France")?.properties,
    ).toMatchObject({ iso2: "FR", iso3: "FRA" });
  });

  // Each row: what the data says -> the Natural Earth name it must land on.
  it.each([
    ["US", "United States of America"], // ISO alpha-2
    ["usa", "United States of America"], // ISO alpha-3, any case
    ["FRA", "France"], // France has -99 in the raw ISO_A3
    ["United States of America", "United States of America"], // exact name
    ["germany", "Germany"], // name, any case
    ["United States", "United States of America"], // alias kept from before
    ["Korea", "South Korea"],
    ["Dem. Rep. Korea", "North Korea"],
    ["UK", "United Kingdom"], // alias, not an ISO code (GB)
    ["Czech Republic", "Czechia"],
    ["Bosnia and Herzegovina", "Bosnia and Herz."],
    ["  Japan ", "Japan"],
    ["Czech Rep.", "Czechia"],
    ["XKX", "Kosovo"], // Kosovo has no ISO alpha-3 in Natural Earth
    ["KOS", "Kosovo"],
    ["Viet Nam", "Vietnam"],
    ["Cote d'Ivoire", "Côte d'Ivoire"],
    ["UAE", "United Arab Emirates"],
    ["Macau", "Macao"], // NE spells it Macao
    ["DRC", "Dem. Rep. Congo"],
  ])("resolves %s to %s", (row, expected) => {
    const { matched, unmatched } = matchRegions(
      [{ name: row, value: 1 }],
      index,
    );
    expect(unmatched).toEqual([]);
    expect(matched).toEqual([{ name: expected, value: 1 }]);
  });

  it("returns a row it cannot place as unmatched instead of dropping it", () => {
    const { matched, unmatched } = matchRegions(
      [
        { name: "Narnia", value: 5 },
        { name: "IT", value: 7 },
        { name: "Atlantis", value: null },
      ],
      index,
    );
    expect(matched).toEqual([{ name: "Italy", value: 7 }]);
    expect(unmatched.map((r) => r.name)).toEqual(["Narnia", "Atlantis"]);
  });

  // A bad name (null from a LEFT JOIN, a number, a key every object inherits)
  // must neither throw nor match a country (CodeRabbit, #2230).
  it.each([
    [null],
    [undefined],
    [840], // ISO numeric codes are not indexed: unmatched, not a crash
    ["840"],
    ["constructor"],
    ["__proto__"],
    ["toString"],
    ["hasOwnProperty"],
    [""],
    ["   "],
  ])("leaves the name %j unmatched without throwing", (name) => {
    const rows = [
      { name, value: 1 },
      { name: "IT", value: 2 },
    ] as never;
    const { matched, unmatched } = matchRegions(rows, index);
    expect(matched).toEqual([{ name: "Italy", value: 2 }]);
    expect(unmatched).toHaveLength(1);
  });

  // The small countries Natural Earth 110m leaves out, added from 50m (#2230).
  it.each([
    ["Singapore", "SG", "SGP"],
    ["Hong Kong", "HK", "HKG"],
    ["Malta", "MT", "MLT"],
    ["Andorra", "AD", "AND"],
  ])("places %s by name, ISO2 (%s) and ISO3 (%s)", (name, iso2, iso3) => {
    const rows = [name, iso2, iso3].map((n) => ({ name: n, value: 1 }));
    const { matched, unmatched } = matchRegions(rows, index);
    expect(unmatched).toEqual([]);
    expect(matched.map((r) => r.name)).toEqual([name, name, name]);
  });

  it("leaves no row of the demo choropleth (scripts/demo/ecommerce-data.mjs regions) unmatched", () => {
    const demoCountries = [
      "USA",
      "France",
      "Germany",
      "Italy",
      "Japan",
      "Singapore",
      "Brazil",
      "Australia",
    ];
    const { unmatched } = matchRegions(
      demoCountries.map((name) => ({ name, value: 1 })),
      index,
    );
    expect(unmatched).toEqual([]);
  });

  it("has no duplicate ISO codes and 62 more shapes than the 110m file's 177", () => {
    for (const key of ["iso2", "iso3"] as const) {
      const codes = world.features
        .map((f) => f.properties[key])
        .filter(Boolean);
      expect(new Set(codes).size).toBe(codes.length);
    }
    expect(world.features).toHaveLength(239);
  });
});
