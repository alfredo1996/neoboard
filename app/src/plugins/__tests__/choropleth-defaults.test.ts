import { describe, it, expect } from "vitest";
import {
  CHOROPLETH_DEFAULT_MIN_COLOR,
  CHOROPLETH_DEFAULT_MAX_COLOR,
} from "@neoboard/components/charts/choropleth-ramp";
import { choroplethSettingsSchema } from "@/plugins/choropleth/settings";

/**
 * #1404 — the shipped choropleth default was incoherent because these two
 * sides disagreed.
 *
 * The component documented a warm ramp (`#fff7d6` → `#993404`) while this
 * plugin's schema still supplied ColorBrewer *Blues* endpoints (`#e8f4f8` →
 * `#08306b`), and the chart's hardcoded interior stops belonged to neither.
 * The result was a legend running pale-blue → pale-yellow → orange →
 * dark-orange → navy, which no reader can order by value.
 *
 * The assertion lives here rather than in component/ because the boundary
 * rules let app/ import from component/ but not the reverse — component owns
 * the ramp constants, app must agree with them.
 */
describe("choropleth plugin defaults match the component's ramp (#1404)", () => {
  it("defaults to the component's documented ramp ends", () => {
    const defaults = choroplethSettingsSchema.parse({});
    expect(defaults.minColor.toLowerCase()).toBe(
      CHOROPLETH_DEFAULT_MIN_COLOR.toLowerCase(),
    );
    expect(defaults.maxColor.toLowerCase()).toBe(
      CHOROPLETH_DEFAULT_MAX_COLOR.toLowerCase(),
    );
  });

  it("no longer ships the ColorBrewer Blues endpoints", () => {
    const defaults = choroplethSettingsSchema.parse({});
    expect(defaults.minColor.toLowerCase()).not.toBe("#e8f4f8");
    expect(defaults.maxColor.toLowerCase()).not.toBe("#08306b");
  });

  it("still honours an explicitly configured pair", () => {
    const custom = choroplethSettingsSchema.parse({
      minColor: "#ffffff",
      maxColor: "#ff0000",
    });
    expect(custom.minColor).toBe("#ffffff");
    expect(custom.maxColor).toBe("#ff0000");
  });
});
