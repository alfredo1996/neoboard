import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * #1849 — skill and agent definitions drift the same way docs do.
 *
 * Duplicates give Claude two paths to choose between and two copies to fall
 * out of step (the label list in the `pr` skill had already drifted). Model-
 * invocable descriptions load into every session and subagent, so a rare,
 * side-effectful skill pays that cost everywhere. And six definitions told
 * agents to run the whole Playwright suite locally, the opposite of the
 * owner's 2026-09-15 decision: run the affected spec, let CI's shards run
 * everything.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const tracked = (...paths) =>
  execFileSync("git", ["ls-files", "-z", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

describe("one copy of each definition (#1849)", () => {
  it("the label taxonomy lives only in github-workflow", () => {
    const copies = tracked(".claude").filter((f) =>
      read(f).includes("area:connectors"),
    );
    expect(copies).toEqual([".claude/skills/github-workflow/SKILL.md"]);
  });

  it("the duplicate definitions are gone", () => {
    // review: the code-reviewer agent, built-in /code-review and CodeRabbit.
    // plan: project-architect, which /drill hands off to.
    // lint-fix: the post-edit hook and `npm run lint -- --fix` (#1844).
    // commit: CLAUDE.md's commit rules and the PR flow (#2196).
    // prioritize: ranked by a P0 the label taxonomy never had (#2196).
    for (const path of [
      ".claude/skills/review",
      ".claude/skills/plan",
      ".claude/agents/lint-fix.md",
      ".claude/skills/commit",
      ".claude/skills/prioritize",
    ]) {
      expect(existsSync(join(ROOT, path)), `${path} still exists`).toBe(false);
    }
  });

  it("nothing still points at them", () => {
    const self = "scripts/__tests__/claude-definitions.test.mjs";
    const pointers =
      /skills\/review\b|skills\/plan\b|agents\/lint-fix|`lint-fix`|skills\/commit\b|skills\/prioritize\b|`\/commit`|`\/prioritize`/;
    const offenders = tracked(".claude", "scripts/__tests__", ".github")
      .filter((f) => f !== self)
      .filter((f) => pointers.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe("rare skills are run on purpose, not discovered (#1849)", () => {
  it.each(["deploy", "release-plan", "harden", "fix-pr-reviews", "release"])(
    "%s is hidden from model invocation",
    (skill) => {
      expect(read(`.claude/skills/${skill}/SKILL.md`)).toMatch(
        /^disable-model-invocation:\s*true\s*$/m,
      );
    },
  );
});

describe("the skills describe how we work now (#2196)", () => {
  // The way the project actually works had moved into the lead session's
  // private memory: the issue template, the merge bar, the agent routing
  // of #2180. The skills that carry it must be ones Claude can see.
  const skill = (name) => read(`.claude/skills/${name}/SKILL.md`);
  const hidden = /^disable-model-invocation:\s*true\s*$/m;

  it.each(["issue", "pr"])("%s is visible to model invocation", (name) => {
    expect(skill(name)).not.toMatch(hidden);
  });

  it("pr carries the whole merge bar", () => {
    const pr = skill("pr");
    expect(pr).toContain("mergeStateStatus"); // CLEAN, read live
    expect(pr).toContain("--match-head-commit"); // the head CI tested
    // #2184: retries: 1 hides a test that failed its first attempt.
    expect(pr).toMatch(/grep[^\n]*✘/);
    expect(pr).toContain("Quality Gate");
  });

  it("issue carries the issue template", () => {
    const issue = skill("issue");
    expect(issue).toContain("## Required tests");
    expect(issue).toContain("the owner can override in a comment");
  });

  it.each(["next", "code"])(
    "%s routes an issue through the agents and switches no branch",
    (name) => {
      const text = skill(name);
      expect(text).toContain("implementer");
      expect(text).toContain("adversarial-reviewer");
      // Hooks run from the main checkout's working copy: it stays on the
      // active release branch.
      expect(text).not.toMatch(/git checkout/);
    },
  );

  it("test finds the active base instead of assuming dev", () => {
    expect(skill("test")).not.toContain("origin/dev");
  });

  it("CLAUDE.md and drill state the same drill policy", () => {
    const policy = "A bug with a reproduction gets the minimal drill";
    expect(read(".claude/CLAUDE.md")).toContain(policy);
    expect(skill("drill")).toContain(policy);
  });
});

describe("local E2E runs the affected spec; CI runs everything (#1849)", () => {
  it("no skill or agent runs the whole Playwright suite locally", () => {
    // A mention must name what to run: a <spec> placeholder or a spec path.
    // `npx playwright test` on its own is the full suite, which CI's five
    // shards already run before any merge.
    const offenders = [];
    for (const file of tracked(".claude/skills", ".claude/agents")) {
      for (const m of read(file).matchAll(/playwright test([^\n]*)/g)) {
        const rest = m[1].trimStart();
        if (!/^(<[^>]+>|\S*\.spec\.ts|e2e\/)/.test(rest)) {
          offenders.push(`${file}: playwright test${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("design-review loads a core, not the whole manual (#1849)", () => {
  const skill = ".claude/skills/design-review/SKILL.md";
  const reference = ".claude/skills/design-review/reference.md";

  it("SKILL.md stays under 6KB and points at reference.md", () => {
    expect(statSync(join(ROOT, skill)).size).toBeLessThan(6000);
    expect(read(skill)).toContain("reference.md");
  });

  it("the reference keeps the detail the core dropped", () => {
    expect(existsSync(join(ROOT, reference))).toBe(true);
    // The palettes and the critique format are what moved.
    expect(read(reference)).toContain("--chart-1");
    expect(read(reference)).toContain("Design Critique Format");
  });

  it("design-reviewer reads the reference, since it needs the full system", () => {
    expect(read(".claude/agents/design-reviewer.md")).toContain(
      "design-review/reference.md",
    );
  });

  it("CLAUDE.md no longer mandates reading it before any UI change", () => {
    expect(read(".claude/CLAUDE.md")).not.toMatch(
      /Before touching any UI code, read/,
    );
  });
});

describe("agents that never apply CLAUDE.md skip loading it (#1862)", () => {
  const frontmatter = (agent) =>
    read(`.claude/agents/${agent}.md`).split(/^---\r?$/m)[1];

  it.each([
    "test-runner",
    "feature-reviewer",
    "ux-crawler",
    "user-sim-admin",
    "user-sim-creator",
  ])("%s omits CLAUDE.md", (agent) => {
    expect(frontmatter(agent)).toMatch(/^omitClaudeMd:\s*true\s*$/m);
  });

  it.each([
    "code-reviewer",
    "project-architect",
    "design-reviewer",
    "implementer",
    "adversarial-reviewer",
  ])(
    "%s keeps CLAUDE.md, since it judges work against the project rules",
    (agent) => {
      expect(frontmatter(agent)).not.toMatch(/omitClaudeMd/);
    },
  );
});

describe("every agent runs on the model it declares (#2180)", () => {
  // An agent without `model:` inherited the main session's model: a week of
  // backlog work ran every subagent on Opus while the definitions said Sonnet.
  const agents = readdirSync(join(ROOT, ".claude/agents")).filter((f) =>
    f.endsWith(".md"),
  );
  const modelOf = (file) =>
    read(`.claude/agents/${file}`)
      .split(/^---\r?$/m)[1]
      .match(/^model:\s*(\S+)\s*$/m)?.[1];

  it.each(agents)("%s declares a model, not inherit", (file) => {
    expect(["sonnet", "opus", "haiku"]).toContain(modelOf(file));
  });

  it.each([
    ["implementer.md", "sonnet"],
    ["adversarial-reviewer.md", "opus"],
  ])("%s runs on %s", (file, model) => {
    expect(modelOf(file)).toBe(model);
  });

  it("anything that names no model defaults to sonnet, not the main model", () => {
    const { env } = JSON.parse(read(".claude/settings.json"));
    expect(env?.CLAUDE_CODE_SUBAGENT_MODEL).toBe("sonnet");
  });
});
