import { describe, it, expect } from "vitest";
// `?raw` — same convention as reduced-motion.test.ts, and for the same reason.
import tokens from "../../design-tokens.css?raw";
import storybookOnly from "../index.css?raw";

/**
 * Guards the dark-mode basemap filter (#1529) — and, more importantly, WHERE
 * it lives.
 *
 * `component/src/index.css` is loaded only by Storybook (#1399): the app
 * imports `globals.css` → `design-tokens.css` and nothing else from this
 * package. A dark-mode rule placed in index.css therefore looks correct in
 * Storybook review and silently does nothing in the product — which is
 * exactly how the #1154 Leaflet dark styling shipped broken, and exactly
 * where this filter was first written before being caught.
 *
 * Like reduced-motion.test.ts, this is a text-presence guard: it fails if the
 * rule is deleted or drifts back into the Storybook-only sheet. It cannot
 * prove the filter looks right — that is the design-review pass's job.
 */
describe("dark-mode basemap filter (#1529)", () => {
  it("lives in design-tokens.css, the sheet the app actually loads", () => {
    const rule = tokens.match(/\.dark\s+\.leaflet-tile-pane\s*\{[^}]*\}/)?.[0];
    expect(rule, "rule missing from design-tokens.css").toBeTruthy();
    expect(rule).toContain("invert(1)");
    expect(rule).toContain("hue-rotate(180deg)");
  });

  it("is scoped to the tile pane, not the container", () => {
    // Inverting `.leaflet-container` would flip the citrine markers to blue —
    // the marker/popup/control panes are siblings of the tile pane.
    expect(tokens).not.toMatch(/\.dark\s+\.leaflet-container\s*\{[^}]*invert/);
  });

  it("has not drifted back into the Storybook-only stylesheet", () => {
    expect(storybookOnly).not.toContain(".leaflet-tile-pane");
  });
});
