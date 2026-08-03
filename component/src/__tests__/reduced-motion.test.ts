import { describe, it, expect } from "vitest";
// `?raw` so vite resolves the path relative to this file — `import.meta.url` is
// not a file URL under this runner, and cwd differs between a workspace-scoped
// run and a root run.
import tokens from "../../design-tokens.css?raw";

/**
 * Guards the global `prefers-reduced-motion` reset in `design-tokens.css` — the
 * one file both `component/src/index.css` and `app/src/app/globals.css` import,
 * and therefore the only place a rule reaches every surface in both packages.
 *
 * Why a global reset rather than `motion-reduce:` on each component (#1458):
 * the ten Radix overlay primitives animate through data-attribute variants like
 * `data-[state=open]:animate-in`, which compile to `.class[data-state=open]` —
 * specificity (0,2,0). A `motion-reduce:animate-none` utility is (0,1,0), and a
 * media query adds no specificity, so the per-component variant simply loses.
 * Only `!important` inside the media query wins, and doing that once beats
 * doing it fourteen times and forgetting it on the fifteenth.
 *
 * This is a text-presence guard, and that is all it is — it fails if the block
 * is deleted or defanged. It cannot prove the cascade resolves as intended;
 * that is what the E2E suite exercises with `reducedMotion: "reduce"`.
 */
describe("prefers-reduced-motion reset", () => {
  it("declares a reduced-motion media block", () => {
    expect(tokens).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("disables animation outright rather than merely shortening it", () => {
    // `animation-duration: 0.01ms` is the common snippet, but it keeps
    // `animationName` non-none, so Radix's presence machinery still waits for
    // an `animationend` that a starved or dropped animation may never deliver.
    // `animation: none` makes Radix unmount synchronously — the property that
    // actually fixes the stuck-dialog flake.
    expect(tokens).toMatch(/animation:\s*none\s*!important/);
  });

  it("disables transitions and smooth scrolling too", () => {
    expect(tokens).toMatch(/transition:\s*none\s*!important/);
    expect(tokens).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("applies to pseudo-elements, not just elements", () => {
    const block = tokens.slice(
      tokens.search(/@media\s*\(prefers-reduced-motion:\s*reduce\)/),
    );
    expect(block).toContain("*::before");
    expect(block).toContain("*::after");
  });
});
