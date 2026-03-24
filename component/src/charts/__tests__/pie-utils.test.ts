import { describe, it, expect } from "vitest";
import { groupTopN } from "../chart-utils";
import type { PieChartDataPoint } from "../types";

describe("groupTopN", () => {
  const data: PieChartDataPoint[] = [
    { name: "A", value: 100 },
    { name: "B", value: 80 },
    { name: "C", value: 60 },
    { name: "D", value: 40 },
    { name: "E", value: 20 },
  ];

  it("returns all data when topN is 0 (disabled)", () => {
    expect(groupTopN(data, 0)).toEqual(data);
  });

  it("returns all data when topN >= data length", () => {
    expect(groupTopN(data, 5)).toEqual(data);
    expect(groupTopN(data, 10)).toEqual(data);
  });

  it("groups remaining items into Other when topN < data length", () => {
    const result = groupTopN(data, 3);
    expect(result).toHaveLength(4);
    expect(result[0].name).toBe("A");
    expect(result[1].name).toBe("B");
    expect(result[2].name).toBe("C");
    expect(result[3].name).toBe("Other");
    expect(result[3].value).toBe(60); // 40 + 20
  });

  it("handles topN of 1", () => {
    const result = groupTopN(data, 1);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[1].name).toBe("Other");
    expect(result[1].value).toBe(200); // 80+60+40+20
  });

  it("returns empty array for empty input", () => {
    expect(groupTopN([], 5)).toEqual([]);
  });
});
