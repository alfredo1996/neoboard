/**
 * The card's fill presets (#2394). Default paints nothing extra; None drops
 * the fill, edge and shadow; the rest are tints. Names, never colours: the
 * stylesheet turns them into tokens. A subpath of its own so the app's store
 * can read it without pulling the component barrel.
 */
export const CARD_BACKGROUNDS = [
  "default",
  "none",
  "azure",
  "citrine",
  "sage",
  "rose",
] as const;
export type CardBackground = (typeof CARD_BACKGROUNDS)[number];

/** A stored value that is not a preset reads as Default. */
export function parseCardBackground(v: unknown): CardBackground {
  return CARD_BACKGROUNDS.find((b) => b === v) ?? "default";
}
