/**
 * Semantic design tokens for consistent color usage across the component library.
 * Centralizes hardcoded Tailwind color classes so the design system can evolve
 * from a single source of truth.
 */

/** Colors for field/column type badges in the field picker. */
export const fieldTypeColors: Record<string, string> = {
  string: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  number: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  date: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  boolean:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  object: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

/** Dot indicator colors for connection status badges. */
export const connectionStatusColors: Record<string, string> = {
  connected: "bg-green-500",
  disconnected: "bg-gray-400",
  connecting: "bg-yellow-500 animate-pulse",
  error: "bg-red-500",
};

/** Syntax-highlight colors for the JSON viewer. */
export const jsonSyntaxColors = {
  string: "text-green-600 dark:text-green-400",
  number: "text-blue-600 dark:text-blue-400",
  boolean: "text-purple-600 dark:text-purple-400",
} as const;

/** Default marker color for the map chart (Leaflet circleMarker) — citrine
 * brand accent (≈ --chart-1), not the off-brand stock blue. */
export const MAP_MARKER_DEFAULT_COLOR = "#f9a91f";

/** Success message color token — sourced from the --success CSS variable so
 * it tracks the theme (light/dark) from a single source of truth. */
export const successTextColor = "text-[hsl(var(--success))]";
