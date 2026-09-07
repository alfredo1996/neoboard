import { describe, it, expect } from "vitest";
// `?raw` — same convention as dark-basemap.test.ts, and for the same reason.
import tokens from "../../design-tokens.css?raw";
import storybookOnly from "../index.css?raw";

/**
 * Dark styling for Leaflet's own furniture — zoom buttons, attribution strip,
 * popups, tooltips (#1154, #1399).
 *
 * It was written into `component/src/index.css`, which only Storybook loads:
 * the app imports `globals.css` → `design-tokens.css` and nothing else from
 * this package. So the rules reviewed fine in Storybook and did nothing in
 * the product, where a dark map still showed white zoom buttons and a white
 * attribution bar.
 *
 * `dark-basemap.test.ts` guards the tile-pane filter the same way and even
 * documents this trap; the rest of the Leaflet chrome was still in the wrong
 * sheet. Text-presence, like its sibling: it fails if a rule is deleted or
 * drifts back, and makes no claim about how the result looks.
 */
const SELECTORS = [
  ".dark .leaflet-control-zoom a",
  ".dark .leaflet-control-zoom a:hover",
  ".dark .leaflet-container .leaflet-control-attribution",
  ".dark .leaflet-container .leaflet-control-attribution a",
  ".dark .leaflet-bar a.leaflet-disabled",
  ".dark .leaflet-popup-content-wrapper",
  ".dark .leaflet-popup-tip",
  ".dark .leaflet-tooltip",
];

describe("dark Leaflet chrome (#1399)", () => {
  it.each(SELECTORS)("%s lives in the sheet the app loads", (selector) => {
    expect(tokens).toContain(selector);
  });

  it("leaves no Leaflet rule in the Storybook-only stylesheet", () => {
    // Anything matching `.leaflet` here is invisible to the product.
    expect(storybookOnly).not.toContain(".leaflet");
  });

  it("keeps the attribution link on the interaction token", () => {
    const rule = tokens.match(
      /\.dark\s+\.leaflet-container\s+\.leaflet-control-attribution\s+a\s*\{[^}]*\}/,
    )?.[0];
    expect(rule, "attribution link rule missing").toBeTruthy();
    expect(rule).toContain("hsl(var(--ring))");
  });
});
