/**
 * Config-time validation for the map Tile Layer template (#1685).
 *
 * Leaflet's `TileLayer.getTileUrl` runs `Util.template(url, data)` for every
 * tile, and `Util.template` throws "No value provided for variable {x}" for
 * any placeholder not in `data`. The layer is added to the map synchronously,
 * so with a template such as Thunderforest's documented
 * `…/{z}/{x}/{y}.png?apikey={apikey}` the throw escapes the chart's effect and
 * latches the error boundary. Leaflet itself fills `{s}`, `{z}`, `{x}`, `{y}`,
 * `{r}` and `{-y}`; a provider's own placeholders are for the user to replace
 * with real values before pasting.
 *
 * Lives here, Leaflet-free, because the option schema must not pull Leaflet
 * in; `charts/map-chart.tsx` imports the same check so the chart and the
 * panel can never disagree about what is a valid template.
 */

/** Leaflet's own `templateRe` (core/Util.js), so this sees what it sees. */
const TEMPLATE_RE = /\{ *([\w_ -]+) *\}/g;

/** What `TileLayer.getTileUrl` supplies on its own. */
const LEAFLET_PLACEHOLDERS = new Set(["s", "z", "x", "y", "r", "-y"]);

/** Placeholder names in `template` that Leaflet would throw on, deduplicated. */
export function unknownTilePlaceholders(template: string): string[] {
  const names = [...template.matchAll(TEMPLATE_RE)].map((m) => m[1]);
  return [...new Set(names)].filter((n) => !LEAFLET_PLACEHOLDERS.has(n));
}

export function validateTileTemplate(
  value: string,
): { level: "error" | "warning"; message: string } | null {
  const unknown = unknownTilePlaceholders(value);
  if (unknown.length === 0) return null;
  const list = unknown.map((n) => `{${n}}`).join(", ");
  return {
    level: "error",
    message: `Leaflet fills only {s}, {z}, {x}, {y}, {r} and {-y}. Replace ${list} with the real value.`,
  };
}
