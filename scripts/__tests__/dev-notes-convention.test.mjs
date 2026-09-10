import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * #1690 — durable dev notes live in the Obsidian vault; `claude_code_docs/`
 * is agent scratch only.
 *
 * `claude_code_docs/` is gitignored, yet ten `.claude/` definitions wrote into
 * it in two unrelated roles: four browser agents dump findings mid-run (they
 * need a throwaway directory), and five planning skills stored durable plans
 * there (those belong in the vault, where they are versioned and linked).
 * `.claude/CLAUDE.md` said nothing about either, so the two drifted.
 *
 * This pins the split: only the scratch agents may point at the directory,
 * and CLAUDE.md must say so — otherwise the next skill that needs somewhere
 * to save a plan reaches for the gitignored directory again.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

/** The browser agents: they append findings as they go so a turn limit loses nothing. */
const SCRATCH_AGENTS = [
  ".claude/agents/feature-reviewer.md",
  ".claude/agents/user-sim-admin.md",
  ".claude/agents/user-sim-creator.md",
  ".claude/agents/ux-crawler.md",
];

/** CLAUDE.md names the directory once — to state that it is scratch. */
const ALLOWED = [...SCRATCH_AGENTS, ".claude/CLAUDE.md"];

/** Every file under `dir`, repo-relative. */
function walk(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    // worktrees/ holds whole nested checkouts, each with its own .claude/.
    if (entry.name === "worktrees" || entry.name === "node_modules") continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

describe("dev notes convention (#1690)", () => {
  it("under .claude/, only the scratch agents (and the convention itself) reference claude_code_docs", () => {
    const referencing = walk(".claude").filter((rel) =>
      readFileSync(join(ROOT, rel), "utf8").includes("claude_code_docs"),
    );
    expect(referencing.sort()).toEqual([...ALLOWED].sort());
  });

  it(".claude/CLAUDE.md says durable notes go to the vault and claude_code_docs is scratch", () => {
    const doc = readFileSync(join(ROOT, ".claude/CLAUDE.md"), "utf8");
    expect(doc).toContain("~/Desktop/neoboard-vault");
    expect(doc).toMatch(/claude_code_docs[^\n]*scratch/);
  });
});
