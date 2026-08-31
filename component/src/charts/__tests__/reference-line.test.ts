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
    const input = JSON.stringify([
      { value: 50, label: "Target", color: "#ff0000" },
    ]);
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
    const input = JSON.stringify([
      { label: "No value" },
      { value: 50, label: "OK" },
    ]);
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

/**
 * #1548 — reference lines never rendered on horizontal bar charts.
 *
 * `buildMarkLineFromRefs` hardcoded `yAxis: line.value`, which is only correct
 * when the value axis is Y. BarChart swaps the axes for horizontal orientation
 * (bar-chart.tsx:177-178), so the numeric reference value was handed to the
 * *category* (ordinal) axis.
 *
 * ECharts 6 does not warn about this. Verified by SSR-rendering both
 * orientations and diffing the SVG: with 5 categories and `yAxis: 50` the
 * markLine path and its label are absent from the output entirely — ECharts
 * drops the line once the value exceeds the ordinal extent (`yAxis: 4` draws,
 * `yAxis: 4.5` does not). That is the "can\'t see no reference line" symptom.
 *
 * The quieter sub-case matters just as much: when the value happens to fall
 * inside the category-index range, ECharts *does* draw a line — a horizontal
 * one, on the wrong row, confidently labelled with the reference value. So the
 * user either sees nothing or sees something wrong.
 *
 * GanttChart already had this right (gantt-chart.tsx:222 uses `xAxis` for the
 * same swapped layout), which is the in-repo precedent for the fix.
 */
describe("buildMarkLineFromRefs axis anchoring (#1548)", () => {
  it("anchors to yAxis by default, for value-on-Y charts", () => {
    const entry = buildMarkLineFromRefs([{ value: 50 }])!.data[0];
    expect(entry.yAxis).toBe(50);
    expect(entry.xAxis).toBeUndefined();
  });

  it("anchors to xAxis when the value axis is X", () => {
    const entry = buildMarkLineFromRefs([{ value: 50 }], "x")!.data[0];
    expect(entry.xAxis).toBe(50);
    expect(entry.yAxis).toBeUndefined();
  });

  it("keeps an explicit y the same as the default", () => {
    const explicit = buildMarkLineFromRefs([{ value: 50 }], "y")!.data[0];
    const implicit = buildMarkLineFromRefs([{ value: 50 }])!.data[0];
    expect(explicit).toEqual(implicit);
  });

  // A value-axis line on a horizontal chart is drawn vertically, and
  // `insideEndTop` renders the label rotated 90 degrees on a vertical line.
  it("labels a vertical line unrotated, above the line", () => {
    const entry = buildMarkLineFromRefs([{ value: 50, label: "Target" }], "x")!
      .data[0];
    expect(entry.label.position).toBe("end");
    expect(entry.label.formatter).toBe("Target");
  });

  it("keeps the in-plot label position for horizontal lines", () => {
    const entry = buildMarkLineFromRefs([{ value: 50 }], "y")!.data[0];
    expect(entry.label.position).toBe("insideEndTop");
  });

  it("carries colour and dash styling through on both axes", () => {
    for (const axis of ["x", "y"] as const) {
      const entry = buildMarkLineFromRefs([{ value: 1, color: "#f00" }], axis)!
        .data[0];
      expect(entry.lineStyle.color).toBe("#f00");
      expect(entry.lineStyle.type).toBe("dashed");
    }
  });
});
