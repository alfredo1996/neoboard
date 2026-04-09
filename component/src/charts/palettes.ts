import { DEEP_OCEAN_LIGHT } from "./theme";

export interface ColorPalette {
  label: string;
  colors: string[];
}

/**
 * Predefined 10-color palettes for ECharts chart types.
 *
 * Each palette contains 10 colors ordered so that the first 5 provide
 * maximum visual contrast for the most common 2-5 series use case.
 *
 * Palette sources:
 * - Tableau 10: industry standard categorical palette (colorblind-safe)
 * - Observable 10: perceptually uniform categorical palette
 * - Sequential: single-hue blue gradient (good for heatmaps, gauges)
 * - Diverging: blue-to-red through neutral (good for pos/neg values)
 * - Warm / Cool: thematic palettes with good separation
 * - Monochrome: neutral grey scale for professional contexts
 */
export const COLOR_PALETTES: Record<string, ColorPalette> = {
  "deep-ocean": {
    label: "Deep Ocean (Default)",
    colors: DEEP_OCEAN_LIGHT,
  },
  tableau: {
    label: "Tableau 10",
    colors: [
      "#4e79a7", // Steel Blue
      "#f28e2b", // Orange
      "#e15759", // Red
      "#76b7b2", // Teal
      "#59a14f", // Green
      "#edc948", // Yellow
      "#b07aa1", // Purple
      "#ff9da7", // Pink
      "#9c755f", // Brown
      "#bab0ac", // Grey
    ],
  },
  observable: {
    label: "Observable 10",
    colors: [
      "#4269d0", // Blue
      "#efb118", // Yellow
      "#ff725c", // Red-Orange
      "#6cc5b0", // Teal
      "#3ca951", // Green
      "#ff8ab7", // Pink
      "#a463f2", // Purple
      "#97bbf5", // Light Blue
      "#9c6b4e", // Brown
      "#9498a0", // Grey
    ],
  },
  sequential: {
    label: "Sequential Blue",
    colors: [
      "#08306b", // Very Dark Blue
      "#08519c", // Dark Blue
      "#2171b5", // Medium-Dark Blue
      "#4292c6", // Medium Blue
      "#6baed6", // Medium-Light Blue
      "#9ecae1", // Light Blue
      "#c6dbef", // Very Light Blue
      "#deebf7", // Near White Blue
      "#f7fbff", // Almost White
      "#023858", // Deep Navy
    ],
  },
  diverging: {
    label: "Diverging (Blue-Red)",
    colors: [
      "#2166ac", // Dark Blue
      "#4393c3", // Blue
      "#92c5de", // Light Blue
      "#d1e5f0", // Very Light Blue
      "#f7f7f7", // Neutral
      "#fddbc7", // Very Light Red
      "#f4a582", // Light Red
      "#d6604d", // Red
      "#b2182b", // Dark Red
      "#67001f", // Very Dark Red
    ],
  },
  warm: {
    label: "Warm Sunset",
    colors: [
      "#d73027", // Red
      "#f46d43", // Orange-Red
      "#fdae61", // Orange
      "#fee08b", // Light Orange
      "#ffffbf", // Light Yellow
      "#d9ef8b", // Yellow-Green
      "#a6d96a", // Light Green
      "#66bd63", // Green
      "#1a9850", // Dark Green
      "#006837", // Very Dark Green
    ],
  },
  cool: {
    label: "Cool Breeze",
    colors: [
      "#313695", // Deep Blue
      "#4575b4", // Blue
      "#74add1", // Light Blue
      "#abd9e9", // Pale Blue
      "#e0f3f8", // Very Pale Blue
      "#fee090", // Light Yellow
      "#fdae61", // Orange
      "#f46d43", // Red-Orange
      "#d73027", // Red
      "#a50026", // Dark Red
    ],
  },
  monochrome: {
    label: "Monochrome",
    colors: [
      "hsl(215, 35%, 18%)", // Near Black
      "hsl(215, 30%, 28%)", // Very Dark
      "hsl(215, 25%, 38%)", // Dark
      "hsl(215, 22%, 48%)", // Medium-Dark
      "hsl(215, 20%, 58%)", // Medium
      "hsl(215, 18%, 67%)", // Medium-Light
      "hsl(215, 15%, 76%)", // Light
      "hsl(215, 12%, 84%)", // Very Light
      "hsl(215, 10%, 91%)", // Near White
      "hsl(215, 40%, 12%)", // Deepest
    ],
  },
};

/**
 * Returns the color array for the given palette ID, or `undefined` if the
 * palette does not exist.
 */
export function getPaletteColors(paletteId: string): string[] | undefined {
  return COLOR_PALETTES[paletteId]?.colors;
}
