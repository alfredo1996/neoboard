import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

// Guards against documentation that describes software we did not write.
//
// The docs audit (#1316) found 7 environment variables, several CLI flags and
// a whole block of sample terminal output that exist nowhere in the source —
// invented, plausible, and impossible to distinguish from the real ones by
// reading. Prose has no compiler, so these three checks are the compiler.
//
// Each check is deliberately weak: it asks whether a documented token appears
// ANYWHERE in source, not whether the surrounding sentence is true. That is
// the part a machine can decide, and it is exactly the class of error that
// slipped through.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DOCS_ROOT = join(ROOT, "docs/src/content/docs");

/** Every .md/.mdx under the docs content root, as { path, text }. */
function docsFiles(dir = DOCS_ROOT) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...docsFiles(full));
    else if (/\.mdx?$/.test(entry.name))
      out.push({ path: relative(ROOT, full), text: readFileSync(full, "utf8") });
  }
  return out;
}

const DOCS = docsFiles();

/** Every `backticked` span in the docs, with the file it came from. */
function backtickedTokens() {
  const found = [];
  for (const { path, text } of DOCS) {
    for (const m of text.matchAll(/`([^`\n]+)`/g))
      found.push({ path, token: m[1] });
  }
  return found;
}

describe("docs accuracy guards (#1316)", () => {
  it("documents no environment variable that does not exist in source", () => {
    // SCREAMING_SNAKE with at least one underscore. Requiring the underscore
    // drops SQL keywords (`BEGIN`, `READ ONLY`) and HTTP verbs without needing
    // a keyword denylist that would drift.
    const ENV_SHAPE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

    const inSource = new Set(
      execFileSync(
        "git",
        [
          "grep",
          "-hoE",
          "[A-Z][A-Z0-9]*(_[A-Z0-9]+)+",
          "--",
          "app/src",
          "cli/src",
          "connection/src",
          "connector-sdk/src",
          "component/src",
          "scripts",
          "docker",
          ".env.example",
        ],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      ).split("\n"),
    );

    const phantom = backtickedTokens()
      .filter(({ token }) => ENV_SHAPE.test(token) && !inSource.has(token))
      .map(({ path, token }) => `${token} (${path})`);

    expect(phantom).toEqual([]);
  });

  it("references no CLI command the CLI does not register", () => {
    // commander registers each verb as .command("name") or .command("name <arg>").
    const cliSrc = readFileSync(join(ROOT, "cli/src/index.ts"), "utf8");
    const registered = new Set(
      [...cliSrc.matchAll(/\.command\(\s*"([a-z][a-z-]*)/g)].map((m) => m[1]),
    );
    // Sub-commands are registered on their parent (`config list`), so a flat
    // set of verbs is the right granularity — `neoboard list` and
    // `neoboard config list` both resolve to a registered "list".

    // "neoboard" is also the Postgres user and database name, so it appears
    // mid-line in pg_dump invocations. Only count it at a command position:
    // start of line (optionally after a `$` prompt) or opening a code span.
    const referenced = new Set();
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(
        /(?:^[ \t]*\$?[ \t]*|`)neoboard[ \t]+([a-z][a-z-]{2,})\b/gm,
      ))
        referenced.add(`${m[1]}|${path}`);

    const unknown = [...referenced]
      .filter((entry) => !registered.has(entry.split("|")[0]))
      .map((entry) => entry.replace("|", " ("))
      .map((s) => `${s})`);

    expect(unknown).toEqual([]);
  });

  it("has no broken internal links", () => {
    // Starlight slug: path under the content root, minus extension, with
    // index collapsing to its directory. Trailing slash is optional in links.
    const slugs = new Set(
      DOCS.map(({ path }) =>
        relative(join(ROOT, "docs/src/content/docs"), join(ROOT, path))
          .replace(/\.mdx?$/, "")
          .replace(/(^|\/)index$/, ""),
      ).map((s) => `/${s}`.replace(/\/$/, "") || "/"),
    );

    const broken = [];
    for (const { path, text } of DOCS)
      for (const m of text.matchAll(/\]\((\/[^)#?\s]*)/g)) {
        const target = m[1].replace(/\/$/, "") || "/";
        // Assets (/favicon.svg, /og.png) resolve against docs/public, not a
        // page slug — checked there instead.
        if (/\.[a-z0-9]{2,4}$/i.test(target)) {
          if (!existsSync(join(ROOT, "docs/public", target)))
            broken.push(`${target} (${path})`);
          continue;
        }
        if (!slugs.has(target)) broken.push(`${target} (${path})`);
      }

    expect(broken).toEqual([]);
  });
});
