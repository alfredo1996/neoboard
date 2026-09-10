import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
 * the durable definitions must point at the vault, and CLAUDE.md must say so
 * — otherwise the next skill that needs somewhere to save a plan reaches for
 * the gitignored directory again.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

const VAULT = "~/Desktop/neoboard-vault";
const ROADMAP = `${VAULT}/roadmap/`;

/** `Save … to \`<path>\`` — the step where a definition writes a plan. */
const SAVE_STEP = /^\s*(?:\d+\.\s+)?Save\b[^`\n]*`([^`]+)`/gm;

/** The browser agents: they append findings as they go so a turn limit loses nothing. */
const SCRATCH_AGENTS = [
  ".claude/agents/feature-reviewer.md",
  ".claude/agents/user-sim-admin.md",
  ".claude/agents/user-sim-creator.md",
  ".claude/agents/ux-crawler.md",
];

/** The planning definitions: they read from and save plans to the vault. */
const DURABLE = [
  ".claude/agents/project-architect.md",
  ".claude/skills/plan/SKILL.md",
  ".claude/skills/code/SKILL.md",
  ".claude/skills/next/SKILL.md",
  ".claude/skills/release-plan/SKILL.md",
];

/** CLAUDE.md names the directory once — to state that it is scratch. */
const ALLOWED = [...SCRATCH_AGENTS, ".claude/CLAUDE.md"];

/**
 * Tracked files under `.claude/`, repo-relative. Only tracked — the directory
 * also holds gitignored per-machine state (`plans/`, `image-cache/`,
 * `launch.json`, `settings.local.json`, `.e2e-needed`, nested `worktrees/`),
 * and a local file mentioning the directory must not turn `npm run verify`
 * red on one machine while CI is green.
 */
const trackedFiles = () =>
  execFileSync("git", ["ls-files", "-z", ".claude"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

describe("dev notes convention (#1690)", () => {
  it("under .claude/, only the scratch agents (and the convention itself) reference claude_code_docs", () => {
    const referencing = trackedFiles().filter((rel) =>
      readFileSync(join(ROOT, rel), "utf8").includes("claude_code_docs"),
    );
    expect(referencing.sort()).toEqual([...ALLOWED].sort());
  });

  it("the durable definitions read from, and save plans to, the vault", () => {
    let saveSteps = 0;
    for (const rel of DURABLE) {
      const text = readFileSync(join(ROOT, rel), "utf8");
      expect(text, rel).toContain(VAULT);
      // A definition may cite the vault as a read source and still save
      // elsewhere, so the save target is pinned on its own.
      for (const [, target] of text.matchAll(SAVE_STEP)) {
        saveSteps++;
        expect(target.startsWith(ROADMAP), `${rel} saves to ${target}`).toBe(
          true,
        );
      }
    }
    expect(
      saveSteps,
      "no save step matched — SAVE_STEP drifted",
    ).toBeGreaterThan(0);
  });

  it(".claude/CLAUDE.md says durable notes go to the vault and claude_code_docs is scratch", () => {
    const doc = readFileSync(join(ROOT, ".claude/CLAUDE.md"), "utf8");
    expect(doc).toContain(VAULT);
    expect(doc).toMatch(/claude_code_docs[^\n]*scratch/);
  });
});
