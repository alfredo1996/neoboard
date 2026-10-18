import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// A missing space between two Tailwind classes fuses them into one that
// matches nothing ("text-smhover:border-card-edge"): the page looks wrong and
// no type check or lint sees it (#2225 review). The first guard covered only
// kit/; this one reads every .tsx in component/ and app/.
//
// ponytail: a grammar check, not Tailwind itself. It reads only string
// literals made entirely of class-shaped tokens (so URLs, "{HH}:{mm}" and
// "node:fs" are skipped) and flags a token whose variant part is no Tailwind
// variant. Upgrade path: eslint-plugin-tailwindcss's no-custom-classname,
// which knows every utility but is a new dependency.
const ROOT = new URL("../..", import.meta.url).pathname;
const PACKAGES = ["component/src", "app/src"];
// Tests assert ids like "4:p:1" and render nothing; cypher-lang is vendored.
const SKIP_DIRS = new Set(["node_modules", "__tests__", "cypher-lang"]);

const TOKEN =
  /^(?:[a-z0-9@[\]()/&=_.,#%>*+-]+:)*!?-?(?:[a-z0-9][a-z0-9-]*(?:-?\[\S+\])?(?:\/[\w.[\]]+)?|\[[a-z-]+:\S+\])$/;
const VARIANT = new RegExp(
  "^(?:" +
    [
      String.raw`(?:group|peer)(?:-[a-z-]+|-\[[^\]]+\]|-(?:data|aria)-\[[^\]]+\])?(?:\/[a-z-]+)?`,
      String.raw`(?:has|supports)-\[.+\]`,
      String.raw`(?:data|aria)-\[[^\]]+\]`,
      String.raw`aria-[a-z-]+`,
      String.raw`(?:min|max)-(?:[a-z0-9]+|\[[^\]]+\])`,
      String.raw`\[.+\]`,
      "hover|focus|focus-within|focus-visible|active|visited|disabled|enabled|checked",
      "indeterminate|required|invalid|read-only|empty|open|first|last|only|odd|even",
      "first-of-type|last-of-type|placeholder-shown|autofill|file|placeholder|selection",
      "marker|backdrop|before|after|first-letter|first-line|dark|sm|md|lg|xl|2xl|print",
      "portrait|landscape|ltr|rtl|motion-safe|motion-reduce|contrast-more|forced-colors",
    ].join("|") +
    ")$",
);

/** The variant prefixes of a token, split on colons outside brackets. */
function variantsOf(token) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  return parts;
}

/** Tokens in a source file's class lists whose variants Tailwind does not know. */
function fusedTokens(source) {
  const bad = [];
  for (const [, literal] of source.matchAll(/["'`]([^"'`\n$]+)["'`]/g)) {
    const tokens = literal.trim().split(/\s+/);
    if (!tokens.some((t) => t.includes(":"))) continue;
    if (!tokens.every((t) => TOKEN.test(t) && !t.includes("//"))) continue; // prose, not classes
    for (const token of tokens) {
      if (!variantsOf(token).every((v) => VARIANT.test(v))) bad.push(token);
    }
  }
  return bad;
}

function tsxFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) tsxFiles(path, out);
    } else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("Tailwind class strings (#2225)", () => {
  it("flags a variant fused onto the class before it", () => {
    expect(fusedTokens(`cn("text-sm hover:border-card-edge")`)).toEqual([]);
    expect(fusedTokens(`cn("text-smhover:border-card-edge")`)).toEqual([
      "text-smhover:border-card-edge",
    ]);
  });

  it("reads Tailwind's variant grammar and skips strings that are not class lists", () => {
    const fine = [
      `"group-hover/panel:opacity-100 has-[[data-state=open]]:opacity-100"`,
      `"[@media(hover:none)]:pointer-events-auto [transition-duration:var(--duration-fast)]"`,
      `"group-data-[title-font=serif]/panel:font-serif file:border-0 placeholder:text-muted-foreground"`,
      `"https://www.openstreetmap.org/copyright"`,
      `"{HH}:{mm}"`,
      `"Save: Ctrl+S"`,
    ];
    for (const source of fine) expect(fusedTokens(source), source).toEqual([]);
  });

  it.each(PACKAGES)("%s has no fused class tokens", (pkg) => {
    const bad = tsxFiles(join(ROOT, pkg)).flatMap((file) =>
      fusedTokens(readFileSync(file, "utf8")).map(
        (t) => `${relative(ROOT, file)}: ${t}`,
      ),
    );
    expect(bad).toEqual([]);
  });
});
