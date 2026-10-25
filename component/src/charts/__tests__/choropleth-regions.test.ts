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
});
