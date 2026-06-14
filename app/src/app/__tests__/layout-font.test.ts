import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The design system self-hosts Inter as the `font-body` token (applied to
 * `body` in globals.css). The root layout must NOT also pull Inter from Google
 * Fonts via next/font — that loaded a redundant second copy (#1059).
 */
describe("root layout font (#1059)", () => {
  const source = readFileSync(join(__dirname, "..", "layout.tsx"), "utf8");

  it("does not import a font from next/font/google", () => {
    expect(source).not.toMatch(/next\/font\/google/);
    // No `import { Inter }` — a passing mention of "Inter" in a comment is fine.
    expect(source).not.toMatch(/import\s*\{[^}]*\bInter\b/);
  });

  it("does not pin a font className on <body> (uses the font-body token)", () => {
    expect(source).not.toMatch(/inter\.className/);
  });
});
