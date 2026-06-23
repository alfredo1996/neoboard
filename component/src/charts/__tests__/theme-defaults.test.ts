import { describe, it, expect, vi } from "vitest";
import { registerNeoboardThemes, formatAxisCompact } from "../theme";

/**
 * Opinionated ECharts theme defaults (#822): charts must look styled out
 * of the box — compact axis numbers, quiet grid, rounded bars with no
 * floating labels, fine smooth lines, token-styled tooltips, pie gaps.
 */

function capturedThemes(): Record<string, Record<string, unknown>> {
  const themes: Record<string, Record<string, unknown>> = {};
  const register = vi.fn((name: string, theme: Record<string, unknown>) => {
    themes[name] = theme;
  });
  registerNeoboardThemes(register);
  return themes;
}

describe("formatAxisCompact (#822)", () => {
  it.each([
    [950, "950"],
    [0, "0"],
    [8000, "8K"],
    [45200, "45.2K"],
    [1_200_000, "1.2M"],
    [2_000_000_000, "2B"],
    [-12_500, "-12.5K"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatAxisCompact(input)).toBe(expected);
  });

  it("leaves non-numeric category labels untouched", () => {
    expect(formatAxisCompact("Electronics")).toBe("Electronics");
  });
});

describe.each(["neoboard-light", "neoboard-dark"])(
  "%s theme defaults (#822)",
  (name) => {
    const theme = capturedThemes()[name] as Record<
      string,
      Record<string, unknown>
    >;

    it("registers the theme", () => {
      expect(theme).toBeDefined();
    });

    it("value axis uses the compact number formatter", () => {
      const axisLabel = (theme.valueAxis as Record<string, unknown>)
        .axisLabel as Record<string, unknown>;
      expect(typeof axisLabel.formatter).toBe("function");
      expect((axisLabel.formatter as (v: number) => string)(45200)).toBe(
        "45.2K",
      );
    });

    it("bars: values hidden by default, subtle top radius", () => {
      const bar = theme.bar as Record<string, Record<string, unknown>>;
      expect((bar.label as Record<string, unknown>).show).toBe(false);
      expect((bar.itemStyle as Record<string, unknown>).borderRadius).toEqual([
        3, 3, 0, 0,
      ]);
    });

    it("lines: 1.5px stroke, round caps, smooth by default", () => {
      const line = theme.line as Record<string, Record<string, unknown>>;
      expect((line.lineStyle as Record<string, unknown>).width).toBe(1.5);
      expect((line.lineStyle as Record<string, unknown>).cap).toBe("round");
      expect(line.smooth).toBe(true);
      expect((line.symbolSize as unknown as number) ?? 4).toBeLessThanOrEqual(
        6,
      );
    });

    it("pies: subtle slice gap via transparent border", () => {
      const pie = theme.pie as Record<string, Record<string, unknown>>;
      expect((pie.itemStyle as Record<string, unknown>).borderWidth).toBe(2);
      expect((pie.itemStyle as Record<string, unknown>).borderColor).toBe(
        "transparent",
      );
    });

    it("tooltip drops the ECharts default white box for token styling", () => {
      const tooltip = theme.tooltip as Record<string, unknown>;
      expect(tooltip.backgroundColor).toBeTruthy();
      expect(tooltip.borderColor).toBeTruthy();
      expect(tooltip.textStyle).toBeTruthy();
      // matches --radius (0.5rem = 8px)
      expect(tooltip.borderRadius).toBe(8);
    });
  },
);
