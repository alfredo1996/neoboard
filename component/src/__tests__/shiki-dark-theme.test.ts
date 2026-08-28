import { describe, it, expect } from "vitest";
// `?raw` — same convention as reduced-motion.test.ts and dark-basemap.test.ts.
import tokens from "../../design-tokens.css?raw";
import { ensureHighlighter, highlightSync } from "../lib/code-highlighter";

/**
 * #1408 — Shiki's dark theme never activated.
 *
 * `code-highlighter.ts` uses dual-theme mode, whose output is not
 * self-contained: the light theme is inlined as real `style` values and the
 * dark theme is emitted only as `--shiki-dark` / `--shiki-dark-bg` custom
 * properties. A stylesheet rule has to opt the dark half in, and that rule
 * existed nowhere — both themes were loaded and paid for in bundle size, and
 * one of them was unreachable. Every fenced code block rendered github-light,
 * a glaring white rectangle on a dark card.
 *
 * The activating rule lives in design-tokens.css, NOT src/index.css where the
 * issue's own fix section pointed: index.css is loaded only by Storybook
 * (#1399), so a rule there passes Storybook review and does nothing in the
 * product. design-tokens.css is imported by both packages.
 */
describe("Shiki dark theme activation (#1408)", () => {
  it("the highlighter emits the dual-theme variables", async () => {
    const loaded = await ensureHighlighter();
    expect(loaded).toBe(true);
    const html = highlightSync("SELECT 1;", "sql");
    expect(html).toBeTruthy();
    // The contract the CSS rule below depends on. If dual-theme mode is ever
    // dropped for a single theme, this fails and the rule can be deleted.
    expect(html).toContain("--shiki-dark:");
    expect(html).toContain("--shiki-dark-bg:");
  });

  it("design-tokens.css consumes the dark variables under .dark", () => {
    const rule = tokens.match(/\.dark\s+\.shiki[^{]*\{[^}]*\}/)?.[0];
    expect(rule, "no .dark .shiki rule in design-tokens.css").toBeTruthy();
    expect(rule).toContain("var(--shiki-dark)");
    expect(rule).toContain("var(--shiki-dark-bg)");
    // Shiki inlines the light theme as real `style` attributes, which beat
    // any stylesheet rule on specificity — only !important overrides them.
    expect(rule).toContain("!important");
  });

  it("covers the spans, not just the <pre>", () => {
    // Every token's colour is its own inline style on a <span>; a rule hitting
    // only the container would fix the background and leave light-theme ink.
    expect(tokens).toMatch(/\.dark\s+\.shiki\s+span\b/);
  });
});
