import { describe, it, expect } from "vitest";
import { equalEarth } from "../equal-earth";

describe("Equal Earth projection (#2230)", () => {
  it.each([
    [0, 0],
    [10, 45],
    [-122.4, 37.8],
    [151.2, -33.9],
    [179, 80],
    [-179, -85],
  ])("unproject(project([%f, %f])) returns the point", (lon, lat) => {
    const [x, y] = equalEarth.project([lon, lat]);
    const [lon2, lat2] = equalEarth.unproject([x, y]);
    expect(lon2).toBeCloseTo(lon, 4);
    expect(lat2).toBeCloseTo(lat, 4);
  });

  it("is the Equal Earth shape: about 2.05 wide for every 1 high", () => {
    // Šavrič, Patterson & Jenny (2018): the full map is 2.054:1.
    const width = 2 * equalEarth.project([180, 0])[0];
    const height = -2 * equalEarth.project([0, 90])[1];
    expect(width / height).toBeCloseTo(2.054, 2);
  });
});
