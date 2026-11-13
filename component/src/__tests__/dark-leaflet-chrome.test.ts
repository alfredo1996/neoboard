import { describe, it, expect } from "vitest";
// `?raw` — same convention as dark-basemap.test.ts, and for the same reason.
import tokens from "../../design-tokens.css?raw";
import storybookOnly from "../index.css?raw";
import mapCss from "../charts/map-chart.css?raw";
import mapChart from "../charts/map-chart.tsx?raw";

/**
 * Dark styling for Leaflet's own furniture — popups and tooltips here; the
 * zoom buttons and attribution strip are themed from tokens in
 * `charts/map-chart.css` (#1154, #1399, #2336).
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

  it("underlines attribution links in the sheet the app loads (#1685)", () => {
    // Line-anchored so the `.dark …` rule above cannot satisfy it: a plain-text
    // attribution puts Leaflet's credit link in a text block, and only an
    // underline can distinguish it there (axe link-in-text-block).
    expect(tokens).toMatch(
      /\n\.leaflet-container\s+\.leaflet-control-attribution\s+a\s*\{[^}]*text-decoration:\s*underline/,
    );
  });

  // The zoom buttons and attribution moved to src/charts/map-chart.css (#2336),
  // which MapChart imports, so one rule serves both themes from the tokens.
  it("themes the map controls from tokens only, in the sheet MapChart imports (#2336)", () => {
    const code = mapCss.replaceAll(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|hsl\(\s*\d/i);
    expect(mapCss).toContain("border-radius: var(--radius-sm)");
    expect(mapCss).toMatch(
      /\.leaflet-control-attribution a\s*\{[^}]*hsl\(var\(--ring\)\)/,
    );
    expect(tokens).not.toContain(".dark .leaflet-control-zoom a");
  });

  it("paints the attribution strip on an opaque ground (#2336)", () => {
    // A translucent ground lets dark tile pixels through and drops the text
    // below 4.5:1.
    const strip =
      /\.leaflet-control-attribution\s*\{([^}]*)\}/.exec(mapCss)?.[1] ?? "";
    expect(strip).toMatch(/background-color:\s*hsl\(var\(--field\)\)\s*;/);
  });

  it("MapChart imports the sheet after leaflet's own (#1399)", () => {
    const leaflet = mapChart.indexOf('import "leaflet/dist/leaflet.css"');
    const ours = mapChart.indexOf('import "./map-chart.css"');
    expect(leaflet).toBeGreaterThan(-1);
    expect(ours).toBeGreaterThan(leaflet);
  });

  it("styles the zoom bar like the secondary Button (#2336)", () => {
    const rule = (sel: string) =>
      new RegExp(String.raw`\n${sel}\s*\{([^}]*)\}`).exec(mapCss)?.[1] ?? "";
    expect(
      rule(String.raw`\.leaflet-bar,\s*\.leaflet-touch \.leaflet-bar`),
    ).toMatch(/border:\s*1px solid hsl\(var\(--border-strong\)\)/);
    const a = rule(
      String.raw`\.leaflet-bar a,\s*\.leaflet-touch \.leaflet-bar a`,
    );
    expect(a).toMatch(/background-color:\s*hsl\(var\(--card\)\)/);
    expect(a).toMatch(/border-bottom-color:\s*hsl\(var\(--border-strong\)\)/);
    expect(
      rule(String.raw`\.leaflet-bar a:hover,\s*\.leaflet-bar a:focus`),
    ).toMatch(/background-color:\s*hsl\(var\(--active\)\)/);
  });
});
