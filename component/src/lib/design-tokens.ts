/**
 * Semantic design tokens for consistent color usage across the component library.
 * Centralizes hardcoded Tailwind color classes so the design system can evolve
 * from a single source of truth.
 */

/** Syntax-highlight colors for the JSON viewer: the --code-* tokens, so the
 * viewer and the text widget's code blocks read as one (#2232). */
export const jsonSyntaxColors = {
  key: "text-foreground-2",
  string: "text-[hsl(var(--code-str))]",
  number: "text-foreground",
  boolean: "text-[hsl(var(--code-key))]",
  punctuation: "text-muted-foreground",
} as const;

/** Default marker color for the map chart (Leaflet circleMarker) — citrine
 * brand accent (≈ --chart-1), not the off-brand stock blue. */
export const MAP_MARKER_DEFAULT_COLOR = "#f9a91f";

/** Success message color token — sourced from the --success CSS variable so
 * it tracks the theme (light/dark) from a single source of truth. */
export const successTextColor = "text-[hsl(var(--success))]";
