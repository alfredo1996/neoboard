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
  // Keyed on the container's data-invert-tiles attribute (#1685): the filter
  // turns a light basemap dark, but a tileset that is already dark — the
  // keyed CARTO dark template, a self-hosted dark style — would come out
  // light. MapChart sets the attribute from `invertTilesInDarkMode`.
  const INVERT_RULE =
    /\.dark\s+\[data-invert-tiles\]\s+\.leaflet-tile-pane\s*\{[^}]*\}/;

  it("lives in design-tokens.css, the sheet the app actually loads", () => {
    const rule = tokens.match(INVERT_RULE)?.[0];
    expect(rule, "rule missing from design-tokens.css").toBeTruthy();
    expect(rule).toContain("invert(1)");
    expect(rule).toContain("hue-rotate(180deg)");
  });

  it("does not invert tiles on a container that opted out", () => {
    // An unscoped `.dark .leaflet-tile-pane` would apply regardless of the
    // attribute — exactly the rule this replaced.
    expect(tokens).not.toMatch(/\.dark\s+\.leaflet-tile-pane\s*\{[^}]*invert/);
  });

  it("is scoped to the tile pane, not the container", () => {
    // Inverting `.leaflet-container` would flip the citrine markers to blue —
    // the marker/popup/control panes are siblings of the tile pane.
    expect(tokens).not.toMatch(/\.dark\s+\.leaflet-container\s*\{[^}]*invert/);
  });

  it("gives the dark container a ground of its own, without inverting it (#1685)", () => {
    // With tileLayer "none" the container IS the basemap. Leaflet paints it
    // #ddd, a light-grey slab on a charcoal dashboard.
    const rule = tokens.match(/\.dark\s+\.leaflet-container\s*\{[^}]*\}/)?.[0];
    expect(rule, "container rule missing from design-tokens.css").toBeTruthy();
    // The dark surface the zoom control uses — a `background-color` of #ddd
    // would satisfy a property-name check and still be the light-grey slab.
    expect(rule).toMatch(/background-color:\s*hsl\(220 13% 11%\)/);
  });

  it("has not drifted back into the Storybook-only stylesheet", () => {
    expect(storybookOnly).not.toContain(".leaflet-tile-pane");
  });
});
