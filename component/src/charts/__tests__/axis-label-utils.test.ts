import { describe, it, expect } from "vitest";
import { buildCategoryAxisLabel } from "../chart-utils";

describe("buildCategoryAxisLabel", () => {
  it("returns default config for small category count", () => {
    const result = buildCategoryAxisLabel(5);
    expect(result.rotate).toBe(0);
    expect(result.formatter).toBeUndefined();
  });

  it("never rotates on its own, however many categories (#2226)", () => {
    expect(buildCategoryAxisLabel(8).rotate).toBe(0);
    expect(buildCategoryAxisLabel(15).rotate).toBe(0);
  });

  it("truncates labels longer than 15 chars with ellipsis", () => {
    const result = buildCategoryAxisLabel(10);
    expect(result.formatter).toBeDefined();
    const fmt = result.formatter as (value: string) => string;
    expect(fmt("Short")).toBe("Short");
    expect(fmt("This is a very long label text")).toBe("This is a very\u2026");
  });

  it("respects custom maxLength", () => {
    const result = buildCategoryAxisLabel(10, { maxLabelLength: 8 });
    const fmt = result.formatter as (value: string) => string;
    expect(fmt("12345678")).toBe("12345678");
    expect(fmt("123456789")).toBe("1234567\u2026");
  });

  it("respects rotation override", () => {
    const result = buildCategoryAxisLabel(100, { rotateOverride: 60 });
    expect(result.rotate).toBe(60);
  });

  it("returns rotate 0 with override of 0", () => {
    const result = buildCategoryAxisLabel(20, { rotateOverride: 0 });
    expect(result.rotate).toBe(0);
  });

  it("always includes tooltip config for full text", () => {
    const result = buildCategoryAxisLabel(10);
    expect(result.tooltip).toEqual({ show: true });
  });

  it("keeps labels in compact mode, truncated not hidden (#1247)", () => {
    const result = buildCategoryAxisLabel(4, {
      containerWidth: 280,
    });
    expect(result.show).toBe(true);
    // Cut to the band, every label shown (#2226): (280 - 72) / 4 - 6 = 46px.
    expect(result).toMatchObject({
      width: 46,
      overflow: "truncate",
      ellipsis: "…",
      interval: 0,
      hideOverlap: true,
    });
    expect(result.formatter).toBeUndefined();
  });

  it("budgets less margin in compact mode, where the value axis is gone", () => {
    // (280 - 16) / 4 - 6 = 60px
    expect(
      buildCategoryAxisLabel(4, { containerWidth: 280, compact: true }).width,
    ).toBe(60);
  });

  it("budgets a caller's own grid insets (the line chart's wider gutter)", () => {
    // (570 - 104) / 10 - 6 = 40.6px, against 43.8px with the default 72px.
    expect(
      buildCategoryAxisLabel(10, { containerWidth: 570, insets: 104 }).width,
    ).toBe(40);
    expect(buildCategoryAxisLabel(10, { containerWidth: 570 }).width).toBe(43);
  });

  it("keeps ECharts' auto interval when a data zoom is on", () => {
    const label = buildCategoryAxisLabel(10, {
      containerWidth: 570,
      zoom: true,
    });
    expect(label.interval).toBeUndefined();
    expect(label.width).toBeUndefined();
    expect(label.hideOverlap).toBe(true);
  });

  it("an explicit angle keeps the character cut, not the band cut", () => {
    const label = buildCategoryAxisLabel(10, {
      containerWidth: 570,
      rotateOverride: 45,
    });
    expect(label.rotate).toBe(45);
    expect(label.width).toBeUndefined();
    expect(label.formatter?.("This is a very long label text")).toBe(
      "This is a very…",
    );
  });

  it("falls back to the character cut and skipping when the band is too narrow", () => {
    // (150 - 72) / 7 = 11px per band: not even a cut label fits.
    const result = buildCategoryAxisLabel(7, {
      containerWidth: 150,
    });
    expect(result.hideOverlap).toBe(true);
    expect(result.interval).toBeUndefined();
    const fmt = result.formatter as (value: string) => string;
    expect(new Set(["Widget A", "Widget G"].map(fmt)).size).toBe(2);
  });

  it("normalizes -1 sentinel to automatic rotation", () => {
    // -1 is the "automatic" sentinel from the UI; automatic no longer
    // rotates (#2226), and it must not produce rotate: -1
    for (const n of [5, 10, 20]) {
      expect(buildCategoryAxisLabel(n, { rotateOverride: -1 }).rotate).toBe(0);
    }
  });

  // #1420: a horizontal bar chart stacks its categories vertically, so the
  // crowding constraint is height and the free space is the left gutter.
  describe("category axis on y (horizontal bars)", () => {
    it("does not auto-rotate, whatever the width or count", () => {
      expect(
        buildCategoryAxisLabel(10, { containerWidth: 530, categoryAxis: "y" })
          .rotate,
      ).toBe(0);
      expect(buildCategoryAxisLabel(20, { categoryAxis: "y" }).rotate).toBe(0);
      expect(
        buildCategoryAxisLabel(10, { rotateOverride: -1, categoryAxis: "y" })
          .rotate,
      ).toBe(0);
    });

    it("still honours an explicit rotation", () => {
      expect(
        buildCategoryAxisLabel(10, {
          containerWidth: 530,
          rotateOverride: 45,
          categoryAxis: "y",
        }).rotate,
      ).toBe(45);
    });

    it("truncates against a third of the width, not a fixed 15 chars", () => {
      const label = buildCategoryAxisLabel(10, {
        containerWidth: 530,
        categoryAxis: "y",
      });
      // The left gutter: a third of the width, less 6px (#2226).
      expect(label).toMatchObject({
        width: 170,
        overflow: "truncate",
        hideOverlap: true,
      });
      expect(label.interval).toBeUndefined(); // ECharts skips by row height
      expect(label.formatter).toBeUndefined();
    });

    it("keeps a 10-char floor in a very narrow container (#1247)", () => {
      const label = buildCategoryAxisLabel(4, {
        containerWidth: 150,
        categoryAxis: "y",
      });
      expect(label.width).toBe(44);
    });

    it("falls back to the default length before the width is measured", () => {
      const fmt = buildCategoryAxisLabel(10, { categoryAxis: "y" })
        .formatter as (value: string) => string;
      expect(fmt("This is a very long label text")).toBe(
        "This is a very\u2026",
      );
    });

    it("leaves fewer than 8 names whole where they were whole before", () => {
      expect(
        buildCategoryAxisLabel(5, { containerWidth: 450, categoryAxis: "y" })
          .formatter,
      ).toBeUndefined();
      expect(
        buildCategoryAxisLabel(3, { categoryAxis: "y" }).formatter,
      ).toBeUndefined();
    });
  });
});
