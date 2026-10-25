import { describe, it, expect } from "vitest";
// `?raw` — same convention as reduced-motion.test.ts and dark-basemap.test.ts.
import tokens from "../../design-tokens.css?raw";
import { ensureHighlighter, highlightSync } from "../lib/code-highlighter";

/**
 * Code in a text widget (#2232): keywords azure, strings green, the rest ink,
 * on the side tint, in both themes from one stylesheet.
 *
 * The highlighter emits CSS variables (`--shiki-token-*`) instead of one
 * theme's inline colours, so the dark theme needs no `!important` override
 * (#1408 had one) and the colours cannot drift from the `--code-*` tokens the
 * JSON viewer uses. design-tokens.css, not src/index.css, because index.css is
 * Storybook-only (#1399).
 */
describe("code highlighting colours (#2232)", () => {
  it("the highlighter emits variables, not a theme's own colours", async () => {
    expect(await ensureHighlighter()).toBe(true);
    const html = highlightSync("SELECT 1 WHERE a = 'x';", "sql")!;
    expect(html).toContain("var(--shiki-token-keyword)");
    expect(html).toContain("var(--shiki-token-string-expression)");
    expect(html).toContain("var(--shiki-background)");
    expect(html).not.toMatch(/color:\s*#[0-9a-f]{6}/i);
  });

  it.each([
    [":root", "--code-key: 212 90% 42%", "--code-str: 141 61% 30%"],
    [".dark", "--code-key: 213 84% 68%", "--code-str: 140 46% 56%"],
  ])("%s defines azure keys and green strings", (selector, key, str) => {
    const block = tokens.slice(tokens.indexOf(`\n${selector} {`));
    const rule = block.slice(0, block.indexOf("\n}"));
    expect(rule).toContain(key);
    expect(rule).toContain(str);
  });

  it("maps the highlighter variables onto those tokens, once for both themes", () => {
    expect(tokens).toMatch(/--shiki-token-keyword:\s*hsl\(var\(--code-key\)\)/);
    expect(tokens).toMatch(
      /--shiki-token-string-expression:\s*hsl\(var\(--code-str\)\)/,
    );
    expect(tokens).toMatch(/--shiki-background:\s*hsl\(var\(--code-bg\)\)/);
  });

  // Dark --side equals --card, so a block on --side had no tint at all.
  it.each([
    [":root", "--code-bg: 220 16% 96%"],
    [".dark", "--code-bg: 215 14% 14%"],
  ])("%s has a code tint of its own", (selector, bg) => {
    const block = tokens.slice(tokens.indexOf(`\n${selector} {`));
    expect(block.slice(0, block.indexOf("\n}"))).toContain(bg);
  });
});
