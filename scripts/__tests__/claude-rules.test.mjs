import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #1847 — CLAUDE.md loads in full at the start of every session and every
 * subagent, so its length is a tax on all of them. The docs put the ceiling at
 * 200 lines: longer files consume more context and reduce adherence.
 *
 * Situational instructions belong in `.claude/rules/*.md` with `paths:`
 * frontmatter, which Claude Code loads only when it reads a matching file.
 * That is only true if the globs actually match something — a typo'd glob is a
 * rule that silently never loads, which is worse than leaving it in CLAUDE.md,
 * because it looks filed away rather than missing.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RULES = join(ROOT, ".claude/rules");

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const trackedFiles = () =>
  execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

/** Frontmatter of a rule file: the block between the first two `---` lines. */
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const paths = [...m[1].matchAll(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map(
    (p) => p[1],
  );
  return { raw: m[1], paths };
}

/** A glob as Claude Code matches it: ** spans directories, * does not. */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
    } else if (glob[i] === "*") {
      out += "[^/]*";
    } else {
      out += glob[i].replace(/[.+^${}()|[\]\\]/, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

const ruleFiles = () =>
  existsSync(RULES) ? readdirSync(RULES).filter((f) => f.endsWith(".md")) : [];

describe("CLAUDE.md stays small enough to be followed (#1847)", () => {
  it("is at most 200 lines", () => {
    // Don't count the trailing newline as a line: a file at exactly the
    // documented limit would fail, and the ratchet would block its own CI job.
    const text = read(".claude/CLAUDE.md");
    const lines = text.split(/\r?\n/).length - Number(text.endsWith("\n"));
    expect(lines).toBeLessThanOrEqual(200);
  });

  it("no longer carries the sections that moved into rules", () => {
    // Pinned by heading: a move that leaves the original behind doubles the
    // cost instead of cutting it, and the two copies then drift apart.
    const doc = read(".claude/CLAUDE.md");
    for (const heading of [
      "## Testing Boundaries",
      "## Charts & Widgets",
      "## Agent Pipeline",
    ]) {
      expect(doc, `${heading} is still in CLAUDE.md`).not.toContain(heading);
    }
  });

  it("keeps the safety rules that must not wait for a file to be opened", () => {
    // Path-scoped rules load when Claude reads a matching file. These have to
    // be in context BEFORE the first line of a new route is written.
    const doc = read(".claude/CLAUDE.md");
    for (const heading of [
      "## Query Safety",
      "## Credentials",
      "## Multi-Tenancy",
    ]) {
      expect(doc, `${heading} must stay in CLAUDE.md`).toContain(heading);
    }
  });
});

describe("every rule file actually loads (#1847)", () => {
  it("the glob matcher distinguishes paths", () => {
    // Negative control: a matcher that returned true for everything would
    // make the coverage check below pass while proving nothing.
    expect(globToRegExp("app/e2e/**").test("app/e2e/widgets.spec.ts")).toBe(
      true,
    );
    expect(globToRegExp("app/e2e/**").test("component/src/x.ts")).toBe(false);
    expect(globToRegExp("**/*.test.*").test("app/src/lib/x.test.ts")).toBe(
      true,
    );
    expect(globToRegExp("**/*.test.*").test("app/src/lib/x.ts")).toBe(false);
    // * stops at a slash; ** does not.
    expect(
      globToRegExp("component/src/*.ts").test("component/src/a/b.ts"),
    ).toBe(false);
  });

  it("there is at least one rule file", () => {
    expect(ruleFiles().length).toBeGreaterThan(0);
  });

  it("each has frontmatter with a non-empty paths list", () => {
    for (const file of ruleFiles()) {
      const fm = frontmatter(read(`.claude/rules/${file}`));
      expect(fm, `${file} has no frontmatter`).not.toBeNull();
      expect(fm.raw, `${file} frontmatter has no paths key`).toMatch(/paths:/);
      expect(fm.paths.length, `${file} lists no paths`).toBeGreaterThan(0);
    }
  });

  it("every glob matches at least one tracked file", () => {
    const files = trackedFiles();
    for (const file of ruleFiles()) {
      for (const glob of frontmatter(read(`.claude/rules/${file}`)).paths) {
        const re = globToRegExp(glob);
        expect(
          files.some((f) => re.test(f)),
          `${file}: no tracked file matches ${glob}, so this rule never loads`,
        ).toBe(true);
      }
    }
  });

  it("references only file paths that exist", () => {
    // The same guard docs-accuracy applies to CLAUDE.md: a stale path in an
    // instruction file becomes a wrong assumption in generated code.
    const prefixes = [
      "app/",
      "component/",
      "connection/",
      "connector-sdk/",
      "cli/",
      "docs/",
      "scripts/",
      ".claude/",
      ".github/",
      "docker/",
    ];
    for (const file of ruleFiles()) {
      const backticked =
        read(`.claude/rules/${file}`).match(/`[^`\s]+`/g) ?? [];
      const missing = [
        ...new Set(
          backticked
            .map((t) => t.slice(1, -1))
            .filter((t) => prefixes.some((p) => t.startsWith(p))),
        ),
      ].filter((p) => !existsSync(join(ROOT, p)));
      expect(missing, `${file} references paths that do not exist`).toEqual([]);
    }
  });
});
