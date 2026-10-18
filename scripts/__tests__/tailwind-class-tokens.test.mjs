import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// A missing space between two Tailwind classes fuses them into one that
// matches nothing ("text-smhover:border-card-edge"): the page looks wrong and
// no type check or lint sees it (#2225 review). The first guard covered only
// kit/; this one reads component/ and app/.
//
// ponytail: a grammar check, not Tailwind itself. It reads only string
// literals made entirely of class-shaped tokens (so URLs, "{HH}:{mm}" and
// import specifiers are skipped) and flags a token whose variant part is no
// Tailwind variant. A lone "widget:resize"-style key in a .tsx would be flagged:
// rename it or split the literal. Upgrade path: eslint-plugin-tailwindcss's no-custom-classname,
// which knows every utility but is a new dependency.
const ROOT = new URL("../..", import.meta.url).pathname;
// component/ keeps class lists in .ts too (control-sizes, design-tokens); app/'s
// .ts files are server code full of ids like "core:scheduler", so only .tsx.
const PACKAGES = [
  ["component/src", /\.tsx?$/],
  ["app/src", /\.tsx$/],
];
// Tests assert ids like "4:p:1" and render nothing; cypher-lang is vendored.
const SKIP_DIRS = new Set(["node_modules", "__tests__", "cypher-lang"]);

const TOKEN =
  /^(?:[a-z0-9@[\]()/&=_.,#%>~*+-]+:)*!?-?(?:[a-z0-9][a-z0-9.-]*(?:-?\[\S+\])?(?:\/[\w.[\]]+)?|\[[a-z-]+:\S+\])$/;
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
  // Import specifiers ("node:fs") are shaped like variant:utility; drop them.
  const code = source.replaceAll(
    /\b(?:from|import)\s*\(?\s*(["'])[^"'\n]*\1/g,
    "",
  );
  // Pair each quote with its own kind, so content-[''] stays inside its list.
  for (const [, , literal] of code.matchAll(/(["'`])((?:(?!\1)[^\n$])+)\1/g)) {
    const tokens = literal.trim().split(/\s+/);
    if (!tokens.some((t) => t.includes(":"))) continue;
    if (!tokens.every((t) => TOKEN.test(t) && !t.includes("//"))) continue; // prose, not classes
    for (const token of tokens) {
      if (!variantsOf(token).every((v) => VARIANT.test(v))) bad.push(token);
    }
  }
  return bad;
}

function sourceFiles(dir, ext, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(path, ext, out);
    } else if (ext.test(entry.name)) out.push(path);
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

  it.each([
    // A decimal utility, a ~ combinator or an inner quote once made the whole
    // list look like prose, so it was skipped unchecked (#2261 review).
    [
      `"px-4 py-3.5 text-smhover:border-card-edge"`,
      "text-smhover:border-card-edge",
    ],
    [
      `"rounded px-1 py-0.5 text-foreground-2focus-visible:outline-none"`,
      "text-foreground-2focus-visible:outline-none",
    ],
    [`"block after:content-[''] text-smhover:bg-x"`, "text-smhover:bg-x"],
    [`"flex [&>svg~*]:pl-7 text-smhover:bg-x"`, "text-smhover:bg-x"],
  ])("still reads a class list holding %s", (source, token) => {
    expect(fusedTokens(source)).toEqual([token]);
  });

  it("skips import specifiers, which look like variant:utility", () => {
    expect(fusedTokens(`import { readFileSync } from "node:fs";`)).toEqual([]);
    expect(fusedTokens(`const fs = await import("node:fs");`)).toEqual([]);
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

  it.each(PACKAGES)("%s has no fused class tokens", (pkg, ext) => {
    const bad = sourceFiles(join(ROOT, pkg), ext).flatMap((file) =>
      fusedTokens(readFileSync(file, "utf8")).map(
        (t) => `${relative(ROOT, file)}: ${t}`,
      ),
    );
    expect(bad).toEqual([]);
  });
});
