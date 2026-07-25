import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the repo's own documentation against drift (#1235).
 *
 * CLAUDE.md is loaded as ground truth by agent sessions, so a stale path or
 * count there becomes a wrong assumption in generated code. These tests fail
 * loudly instead.
 */

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const readDoc = (name: string) =>
  readFileSync(resolve(REPO_ROOT, name), "utf8");

/** Top-level dirs that make a backticked token a repo path rather than an npm specifier. */
const REPO_PREFIXES = [
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

function referencedPaths(markdown: string): string[] {
  const backticked = markdown.match(/`[^`\s]+`/g) ?? [];
  return [
    ...new Set(
      backticked
        .map((t) => t.slice(1, -1))
        .filter((t) => REPO_PREFIXES.some((p) => t.startsWith(p))),
    ),
  ];
}

const countFiles = (dir: string, ext = ".tsx") =>
  readdirSync(resolve(REPO_ROOT, dir)).filter((f) => f.endsWith(ext)).length;

describe("documentation accuracy", () => {
  describe.each(["CLAUDE.md", "ARCHITECTURE.md"])("%s", (docName) => {
    it("references only file paths that exist", () => {
      const missing = referencedPaths(readDoc(docName)).filter(
        (p) => !existsSync(resolve(REPO_ROOT, p)),
      );
      expect(missing).toEqual([]);
    });
  });

  describe("ARCHITECTURE.md component counts match the filesystem", () => {
    // Each regex must match: a reworded claim should fail here rather than
    // silently stop being checked.
    it.each([
      [
        "shadcn/ui primitives",
        /(\d+) shadcn\/ui primitives/,
        () => countFiles("component/src/components/ui"),
      ],
      [
        "composed components",
        /(\d+) higher-order components/,
        () => countFiles("component/src/components/composed"),
      ],
      [
        "chart modules",
        /BaseChart \+ (\d+) types/,
        // charts/ holds base-chart.tsx plus one module per chart type.
        () => countFiles("component/src/charts") - 1,
      ],
    ])("%s", (_label, pattern, actual) => {
      const match = readDoc("ARCHITECTURE.md").match(pattern);
      expect(
        match,
        `claim matching ${pattern} not found — was it reworded?`,
      ).not.toBeNull();
      expect(Number(match![1])).toBe(actual());
    });
  });

  it("CLAUDE.md documents MIGRATE_ON_START, not a --skip-migrations flag", () => {
    // Naming the flag to debunk it is fine (readers search for it); asserting
    // it exists is not. The real escape hatch is MIGRATE_ON_START=0 (#1222).
    const doc = readDoc("CLAUDE.md");
    expect(doc).toContain("MIGRATE_ON_START");
    // Assert the canonical debunk is present rather than blocklisting one
    // phrasing — "use `--skip-migrations`" would slip past a negative regex.
    expect(doc).toContain("there is no `--skip-migrations` CLI flag");
  });
});
