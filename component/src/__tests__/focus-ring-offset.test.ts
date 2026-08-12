import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import type { Config } from "tailwindcss";

// The preset is CommonJS with no .d.ts; load it the way the real
// tailwind.config files do rather than adding a declaration for one import.
const preset = createRequire(import.meta.url)(
  "../../tailwind-preset.cjs",
) as Partial<Config>;

/**
 * #1293 — focus rings using `ring-offset-2` painted a white halo in dark mode.
 *
 * Tailwind seeds `--tw-ring-offset-color` in its base layer from
 * `theme('ringOffsetColor.DEFAULT', '#fff')` (tailwindcss/src/corePlugins.js).
 * The stock theme leaves that key undefined, so every `ring-offset-*` utility
 * falls back to opaque white regardless of the active theme.
 *
 * Asserting the compiled CSS rather than the config object: the config only
 * proves the key was typed, the compiled output proves it reaches the base
 * layer and therefore every component at once.
 */
async function compileBaseLayer(): Promise<string> {
  const result = await postcss([
    tailwindcss({
      presets: [preset],
      darkMode: ["class"],
      // No real content — the base layer is emitted regardless, and scanning
      // src/ would make this test depend on unrelated component churn.
      content: [{ raw: "" }],
    }),
  ]).process("@tailwind base;", { from: undefined });
  return result.css;
}

describe("#1293 — ring offset colour follows the theme", () => {
  it("seeds --tw-ring-offset-color from the background token, not white", async () => {
    const css = await compileBaseLayer();

    const decl = css.match(/--tw-ring-offset-color:\s*([^;]+);/);
    expect(decl, "base layer should declare --tw-ring-offset-color").not.toBe(
      null,
    );

    const value = decl![1].trim();
    expect(value).toBe("hsl(var(--background))");
    // The specific regression: Tailwind's built-in fallback.
    expect(value).not.toBe("#fff");
  });
});
