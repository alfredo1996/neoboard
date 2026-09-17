import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * #1853 — the workflow that closes referenced issues runs on
 * `pull_request_target`, so it holds this repository's token even for PRs from
 * forks. That is safe only while it runs no code from the repository or the PR:
 * after a merge, the base branch contains the PR's own changes, so checking
 * out and executing anything from it would run code the PR may have rewritten
 * (found by review on #1858). These tests pin that boundary.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PATH = ".github/workflows/close-issues-on-merge.yml";
const wf = () => readFileSync(join(ROOT, PATH), "utf8");

describe("close-issues-on-merge workflow (#1853)", () => {
  it("exists", () => {
    expect(existsSync(join(ROOT, PATH))).toBe(true);
  });

  it("runs on a closed pull_request_target", () => {
    expect(wf()).toMatch(/^\s+pull_request_target:\s*$/m);
    expect(wf()).toMatch(/types:\s*\[\s*closed\s*\]/);
  });

  it("acts only on merges into a non-default branch", () => {
    // GitHub already handles the default branch; doing it twice would comment twice.
    expect(wf()).toContain("github.event.pull_request.merged == true");
    expect(wf()).toContain(
      "github.event.pull_request.base.ref != github.event.repository.default_branch",
    );
  });

  it("grants exactly issues: write", () => {
    const block = /^permissions:\n((?:[ \t]+\S.*\n)+)/m.exec(wf());
    expect(block, "no top-level permissions block").not.toBeNull();
    expect(
      block[1]
        .trim()
        .split("\n")
        .map((l) => l.trim()),
    ).toEqual(["issues: write"]);
  });

  it("checks nothing out and runs no repository script", () => {
    // After the merge, the base branch holds the PR's changes: any checked-out
    // file could be one the PR rewrote.
    // Comments are skipped: the header names the tests that guard this file.
    const code = wf()
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    expect(code).not.toMatch(/actions\/checkout/);
    expect(code).not.toMatch(/\bnode\s+(?!-\s)\S/);
    expect(code).not.toMatch(/scripts\//);
    // The inline parser is the only code that runs.
    expect(code).toMatch(/node - <<'JS'/);
  });

  it("passes the PR body only through an env var, never into a command", () => {
    const uses = wf()
      .split("\n")
      .filter((l) => l.includes("github.event.pull_request.body"));
    expect(uses.length, "the body is never read").toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(
        /^\s+[A-Z_]+:\s*\$\{\{\s*github\.event\.pull_request\.body\s*\}\}\s*$/,
      );
    }
  });

  it("never references the PR head", () => {
    expect(wf()).not.toMatch(/pull_request\.head\./);
    expect(wf()).not.toMatch(/github\.head_ref/);
  });

  it("installs nothing", () => {
    expect(wf()).not.toMatch(/\bnpm (ci|install|i)\b|\byarn\b|\bpnpm\b/);
  });
});
