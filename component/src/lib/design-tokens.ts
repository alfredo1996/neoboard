/**
 * Semantic design tokens for consistent color usage across the component library.
 * Centralizes hardcoded Tailwind color classes so the design system can evolve
 * from a single source of truth.
 */

/** Syntax-highlight colors for the JSON viewer. */
export const jsonSyntaxColors = {
  string: "text-green-700 dark:text-green-400",
  number: "text-blue-600 dark:text-blue-400",
  boolean: "text-purple-600 dark:text-purple-400",
} as const;

/** Default marker color for the map chart (Leaflet circleMarker) — citrine
 * brand accent (≈ --chart-1), not the off-brand stock blue. */
export const MAP_MARKER_DEFAULT_COLOR = "#f9a91f";

/** Success message color token — sourced from the --success CSS variable so
 * it tracks the theme (light/dark) from a single source of truth. */
export const successTextColor = "text-[hsl(var(--success))]";
