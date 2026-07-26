import { describe, it, expect } from "vitest";
import { buildCategoryAxisLabel } from "../chart-utils";

describe("buildCategoryAxisLabel", () => {
  it("returns default config for small category count", () => {
    const result = buildCategoryAxisLabel(5);
    expect(result.rotate).toBe(0);
    expect(result.formatter).toBeUndefined();
  });

  it("rotates labels at 30° when categories >= 8", () => {
    const result = buildCategoryAxisLabel(8);
    expect(result.rotate).toBe(30);
  });

  it("rotates labels at 45° when categories >= 15", () => {
    const result = buildCategoryAxisLabel(15);
    expect(result.rotate).toBe(45);
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
    const fmt = result.formatter as (value: string) => string;
    expect(fmt("Electronics")).toBe("Electroni…");
    expect(fmt("Home")).toBe("Home");
  });

  it("keeps common-prefix labels distinguishable in a compact container", () => {
    const result = buildCategoryAxisLabel(7, {
      containerWidth: 280,
    });
    const fmt = result.formatter as (value: string) => string;
    expect(new Set(["Widget A", "Widget G"].map(fmt)).size).toBe(2);
  });

  it("normalizes -1 sentinel to automatic rotation", () => {
    // -1 is the "automatic" sentinel from the UI; it should fall through
    // to the category-count heuristic, not produce rotate: -1
    const few = buildCategoryAxisLabel(5, { rotateOverride: -1 });
    expect(few.rotate).toBe(0);

    const medium = buildCategoryAxisLabel(10, { rotateOverride: -1 });
    expect(medium.rotate).toBe(30);

    const many = buildCategoryAxisLabel(20, { rotateOverride: -1 });
    expect(many.rotate).toBe(45);
  });
});
