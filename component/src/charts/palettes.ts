import { DEEP_OCEAN_LIGHT } from "./theme";

export interface ColorPalette {
  label: string;
  colors: string[];
}

/**
 * Predefined 10-color palettes for ECharts chart types.
 *
 * Each palette contains 10 colors ordered so that the first 5 provide
 * maximum visual contrast for the most common 2–5 series use case.
 */
export const COLOR_PALETTES: Record<string, ColorPalette> = {
  "deep-ocean": {
    label: "Deep Ocean (Default)",
    colors: DEEP_OCEAN_LIGHT,
  },
  "warm-sunset": {
    label: "Warm Sunset",
    colors: [
      "hsl(14, 90%, 55%)",   // 1  Tomato Red
      "hsl(38, 95%, 52%)",   // 2  Amber
      "hsl(55, 88%, 50%)",   // 3  Gold
      "hsl(0, 80%, 60%)",    // 4  Coral
      "hsl(25, 85%, 45%)",   // 5  Burnt Orange
      "hsl(48, 90%, 60%)",   // 6  Yellow
      "hsl(5, 75%, 70%)",    // 7  Salmon
      "hsl(340, 70%, 55%)",  // 8  Raspberry
      "hsl(30, 60%, 35%)",   // 9  Mahogany
      "hsl(60, 70%, 70%)",   // 10 Light Yellow
    ],
  },
  "cool-breeze": {
    label: "Cool Breeze",
    colors: [
      "hsl(199, 89%, 48%)",  // 1  Sky Blue
      "hsl(160, 84%, 39%)",  // 2  Teal
      "hsl(217, 91%, 60%)",  // 3  Blue
      "hsl(142, 71%, 45%)",  // 4  Green
      "hsl(185, 80%, 44%)",  // 5  Cyan
      "hsl(240, 60%, 65%)",  // 6  Periwinkle
      "hsl(172, 66%, 50%)",  // 7  Aquamarine
      "hsl(210, 50%, 75%)",  // 8  Steel Blue
      "hsl(130, 50%, 60%)",  // 9  Mint
      "hsl(225, 70%, 45%)",  // 10 Royal Blue
    ],
  },
  "earth-tones": {
    label: "Earth Tones",
    colors: [
      "hsl(25, 60%, 45%)",   // 1  Terra Cotta
      "hsl(85, 40%, 40%)",   // 2  Olive Green
      "hsl(35, 50%, 55%)",   // 3  Tan
      "hsl(15, 55%, 35%)",   // 4  Burnt Sienna
      "hsl(100, 35%, 50%)",  // 5  Sage
      "hsl(45, 65%, 50%)",   // 6  Sand
      "hsl(200, 30%, 40%)",  // 7  Slate
      "hsl(60, 30%, 60%)",   // 8  Khaki
      "hsl(10, 40%, 60%)",   // 9  Dusty Rose
      "hsl(130, 25%, 45%)",  // 10 Forest
    ],
  },
  "neon": {
    label: "Neon",
    colors: [
      "hsl(320, 100%, 60%)", // 1  Neon Pink
      "hsl(170, 100%, 45%)", // 2  Neon Cyan
      "hsl(55, 100%, 55%)",  // 3  Neon Yellow
      "hsl(280, 100%, 65%)", // 4  Neon Purple
      "hsl(140, 100%, 45%)", // 5  Neon Green
      "hsl(15, 100%, 60%)",  // 6  Neon Orange
      "hsl(200, 100%, 55%)", // 7  Neon Blue
      "hsl(350, 100%, 60%)", // 8  Neon Red
      "hsl(90, 100%, 50%)",  // 9  Neon Lime
      "hsl(240, 100%, 70%)", // 10 Neon Indigo
    ],
  },
  "monochrome": {
    label: "Monochrome",
    colors: [
      "hsl(215, 35%, 20%)",  // 1  Very Dark Blue-Grey
      "hsl(215, 30%, 32%)",  // 2  Dark Blue-Grey
      "hsl(215, 25%, 44%)",  // 3  Medium-Dark Blue-Grey
      "hsl(215, 22%, 55%)",  // 4  Medium Blue-Grey
      "hsl(215, 20%, 65%)",  // 5  Medium-Light Blue-Grey
      "hsl(215, 18%, 73%)",  // 6  Light Blue-Grey
      "hsl(215, 15%, 80%)",  // 7  Very Light Blue-Grey
      "hsl(215, 12%, 87%)",  // 8  Near White Blue-Grey
      "hsl(215, 40%, 15%)",  // 9  Near Black Blue-Grey
      "hsl(215, 10%, 93%)",  // 10 Almost White
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
