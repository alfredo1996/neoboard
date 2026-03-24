import { describe, it, expect } from "vitest";
import { parseReferenceLines, buildMarkLineFromRefs } from "../chart-utils";
import type { ReferenceLine } from "../chart-utils";

describe("parseReferenceLines", () => {
  it("returns empty array for undefined input", () => {
    expect(parseReferenceLines(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseReferenceLines("")).toEqual([]);
  });

  it("parses a single horizontal reference line", () => {
    const input = JSON.stringify([{ value: 50, label: "Target", color: "#ff0000" }]);
    const result = parseReferenceLines(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ value: 50, label: "Target", color: "#ff0000" });
  });

  it("parses multiple reference lines", () => {
    const input = JSON.stringify([
      { value: 25, label: "Low" },
      { value: 75, label: "High", color: "#00ff00" },
    ]);
    const result = parseReferenceLines(input);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseReferenceLines("not-json")).toEqual([]);
  });

  it("filters out entries without a value", () => {
    const input = JSON.stringify([{ label: "No value" }, { value: 50, label: "OK" }]);
    const result = parseReferenceLines(input);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(50);
  });
});

describe("buildMarkLineFromRefs", () => {
  it("returns undefined for empty array", () => {
    expect(buildMarkLineFromRefs([])).toBeUndefined();
  });

  it("builds markLine for a single reference line with defaults", () => {
    const result = buildMarkLineFromRefs([{ value: 50 }]);
    expect(result).toBeDefined();
    expect(result!.silent).toBe(true);
    expect(result!.symbol).toBe("none");
    expect(result!.data).toHaveLength(1);

    const entry = result!.data[0];
    expect(entry.yAxis).toBe(50);
    expect(entry.label.formatter).toBe("50");
    expect(entry.lineStyle.color).toBe("#888");
    expect(entry.lineStyle.type).toBe("dashed");
  });

  it("uses the label text when provided", () => {
    const result = buildMarkLineFromRefs([{ value: 75, label: "Target" }]);
    expect(result!.data[0].label.formatter).toBe("Target");
  });

  it("uses custom color when provided", () => {
    const result = buildMarkLineFromRefs([{ value: 25, color: "#ff0000" }]);
    expect(result!.data[0].lineStyle.color).toBe("#ff0000");
  });

  it("falls back to default color #888 when color is omitted", () => {
    const result = buildMarkLineFromRefs([{ value: 10 }]);
    expect(result!.data[0].lineStyle.color).toBe("#888");
  });

  it("builds markLine for multiple reference lines", () => {
    const lines: ReferenceLine[] = [
      { value: 20, label: "Low", color: "#00ff00" },
      { value: 80, label: "High", color: "#ff0000" },
    ];
    const result = buildMarkLineFromRefs(lines);
    expect(result!.data).toHaveLength(2);
    expect(result!.data[0].yAxis).toBe(20);
    expect(result!.data[0].label.formatter).toBe("Low");
    expect(result!.data[0].lineStyle.color).toBe("#00ff00");
    expect(result!.data[1].yAxis).toBe(80);
    expect(result!.data[1].label.formatter).toBe("High");
    expect(result!.data[1].lineStyle.color).toBe("#ff0000");
  });

  it("sets label position to insideEndTop", () => {
    const result = buildMarkLineFromRefs([{ value: 42 }]);
    expect(result!.data[0].label.position).toBe("insideEndTop");
  });
});

describe("ReferenceLine type", () => {
  it("accepts minimal reference line", () => {
    const line: ReferenceLine = { value: 100 };
    expect(line.value).toBe(100);
  });
});
