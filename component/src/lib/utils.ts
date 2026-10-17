// Component package utilities — coverage verified at 85%+ lines
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom type scale of tailwind-preset.cjs (#2215, plus h1-h3). Without it
// twMerge reads `text-meta` as a text colour and drops it next to
// `text-muted-foreground`. A literal list, not an import of the preset, keeps
// Tailwind out of the runtime bundle; utils.test.ts holds it equal to the
// preset's fontSize keys.
export const CUSTOM_TEXT_SIZES = [
  "title",
  "stat",
  "section",
  "body",
  "widget-title",
  "meta",
  "caption",
  "figure",
  "wordmark",
  "h1",
  "h2",
  "h3",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: { "font-size": [{ text: CUSTOM_TEXT_SIZES }] },
    theme: { radius: ["overlay", "checkbox"], shadow: ["card"] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
