import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * #1853 — the workflow that closes referenced issues runs on
 * `pull_request_target`, so it holds this repository's token even for PRs from
 * forks. That is safe only while it never runs code or interpolates text from
 * the PR. These tests pin that boundary: a later edit that inlines the body
 * into a shell step, checks out the PR head, installs dependencies or widens
 * the token must fail here, not in production.
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

  it("grants exactly issues: write and contents: read", () => {
    const block = /^permissions:\n((?:[ \t]+\S.*\n)+)/m.exec(wf());
    expect(block, "no top-level permissions block").not.toBeNull();
    const perms = block[1]
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .sort();
    expect(perms).toEqual(["contents: read", "issues: write"]);
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
