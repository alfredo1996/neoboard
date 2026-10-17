import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// A missing space between two Tailwind classes fuses them into one that
// matches nothing ("text-smhover:border-card-edge"): the page looks wrong and
// no type check or lint sees it (#2225 review).
const dir = join(__dirname, "..");
const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

const VARIANT =
  /^(hover|focus|focus-within|focus-visible|active|disabled|first|last|dark|after|before|sm|md|lg|xl|motion-reduce|group-hover|data-\[[^\]]+\]|aria-[a-z-]+|max-[a-z]+|\[[^\]]+\])$/;

describe("kit class strings", () => {
  it.each(files)("%s has no fused variant tokens", (file) => {
    const source = readFileSync(join(dir, file), "utf8");
    const bad: string[] = [];
    for (const [, literal] of source.matchAll(/"([^"\n]+)"/g)) {
      for (const token of literal.split(/\s+/)) {
        if (!token.includes(":") || token.startsWith("(")) continue;
        const variants = token.split(":").slice(0, -1);
        if (!variants.every((v) => VARIANT.test(v))) bad.push(token);
      }
    }
    expect(bad).toEqual([]);
  });
});
