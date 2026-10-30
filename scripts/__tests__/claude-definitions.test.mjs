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
      /skills\/review\b|skills\/plan\b|agents\/lint-fix|`lint-fix`|skills\/commit\b|skills\/prioritize\b|`\/commit`|`\/prioritize`|`\/plan`/;
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

  it("the base comes from the issue's milestone, not the newest release branch (#2234)", () => {
    // `sort -V | tail -1` sent every v1.6.1 fix to release/1.7 once both
    // were open. The rule lives in scripts/lib/active-base.mjs, tested there.
    expect(
      tracked(".claude").filter((f) => read(f).includes("sort -V")),
    ).toEqual([]);
    expect(JSON.parse(read("package.json")).scripts.base).toBe(
      "node scripts/base.mjs",
    );
    for (const name of ["code", "pr", "test", "next"]) {
      expect(skill(name)).toContain("run -s base");
    }
    // From app/, `npm run` finds app's package.json and prints nothing, and
    // the test skill's own E2E step leaves the shell there.
    const runs = tracked(".claude/skills").flatMap((f) =>
      read(f)
        .split("\n")
        .filter((l) => /BASE=\$\(npm|!`npm/.test(l))
        .map((l) => `${f}: ${l.trim()}`),
    );
    expect(runs.length).toBeGreaterThanOrEqual(4);
    expect(
      runs.filter(
        (l) =>
          !l.includes(
            'npm --prefix "$(git rev-parse --show-toplevel)" run -s base',
          ),
      ),
    ).toEqual([]);
  });

  it("reads issues and PRs only with --json, the form that runs here", () => {
    // Without --json, gh 2.62 asks GraphQL for Projects (classic) cards,
    // which GitHub rejects on this repo: `gh issue view <N> --comments`
    // exits 1, so the owner's decisions in the comments go unread.
    const offenders = [];
    for (const file of tracked(
      ".claude/skills",
      ".claude/agents",
      ".claude/CLAUDE.md",
    )) {
      for (const line of read(file).split("\n")) {
        if (/gh (issue|pr) view\b/.test(line) && !line.includes("--json")) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
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

describe("review findings go to a fresh implementer (#2180, 2026-10-18)", () => {
  // Resuming the original implementer re-read 300–450k tokens of context per
  // turn for one-line findings; the owner moved fix rounds to a fresh agent.
  it("CLAUDE.md says so", () => {
    expect(read(".claude/CLAUDE.md")).toContain(
      "Review findings go to a **fresh** `implementer`",
    );
  });

  it.each(["code", "next", "pr"])(
    "the %s skill no longer sends them to the same implementer",
    (name) => {
      const skill = read(`.claude/skills/${name}/SKILL.md`);
      expect(skill).not.toMatch(/same `?implementer/);
      expect(skill).toContain("fresh `implementer`");
      // Every finding goes to the fixer, which dismisses with evidence: a lead
      // that filtered to "real" ones dropped real bugs (~/.claude/rules/workflows.md).
      expect(skill).not.toMatch(/real findings/);
      expect(skill).toContain("every finding");
    },
  );

  it.each(["code", "next", "pr"])(
    "the %s skill spawns the fixer in the branch's worktree, not a new one",
    (name) => {
      // isolation: "worktree" cuts a new branch from the base, without the
      // commits under review (#2261 review).
      expect(read(`.claude/skills/${name}/SKILL.md`)).toContain(
        "without `isolation`",
      );
    },
  );

  it("fix-pr-reviews hands CodeRabbit's nitpicks to the fixer too (owner, 2026-10-18)", () => {
    const skill = read(".claude/skills/fix-pr-reviews/SKILL.md");
    expect(skill).not.toMatch(/skip suggestions marked as optional or nitpick/);
    expect(skill).toContain("nitpicks included");
  });

  it("the implementer knows a fix round skips setup and stays on the branch", () => {
    const implementer = read(".claude/agents/implementer.md");
    const fixRound = implementer.slice(implementer.indexOf("## Fix round"));
    expect(implementer).toContain("## Fix round");
    expect(fixRound).toContain("skip Setup 1–2");
    expect(fixRound).toContain("never check out another branch");
    // Its shell starts in the lead's checkout: npm and npx have no -C.
    expect(fixRound).toContain("`cd <worktree> &&`");
  });
});

describe("only the reviewer builds the code graph in a worktree (owner, 2026-10-31)", () => {
  // graphify-out/ is gitignored, so no worktree has a graph. Building one in the
  // implementer's setup cost about 15 s a run and bought 0 questions in 282 runs
  // (graph-usage.py, to 2026-10-30): the owner's global reminder now points a
  // worktree at the main checkout's graph. The reviewer still builds its own,
  // because it has to see the branch's new functions.
  const implementer = read(".claude/agents/implementer.md");
  const reviewer = read(".claude/agents/adversarial-reviewer.md");

  it("the implementer builds no graph, in setup or in a fix round", () => {
    expect(implementer).not.toContain("graphify update");
  });

  it("the implementer is still sent to the graph for callers", () => {
    expect(implementer).toContain(".claude/rules/codebase-graph.md");
  });

  it("the reviewer refreshes it, the one write a read-only review may make", () => {
    expect(reviewer).toContain("graphify update .");
    expect(reviewer).toContain("graphify-out/");
  });

  it("the reviewer accounts for the callers the diff did not touch", () => {
    expect(reviewer).toContain("callers the diff did not touch");
  });
});

describe("the test runner reads a Docker failure as a full disk first", () => {
  // The errors never say disk: Testcontainers volumes filled the VM, 90 GB in a
  // day, and red runs were called flakes.
  it("names the errors and the check", () => {
    const runner = read(".claude/agents/test-runner.md");
    expect(runner).toContain("Log stream ended");
    expect(runner).toContain("docker system df");
  });
});

describe("settings.json permissions", () => {
  it("deny rules for paths use Edit(), which covers every file tool", () => {
    // Claude Code matches path rules only as Edit(path): Write(.env*) denied
    // nothing and printed a warning on every headless run (retro 2026-10-18).
    const { deny } = JSON.parse(read(".claude/settings.json")).permissions;
    expect(deny.filter((rule) => /^Write\(/.test(rule))).toEqual([]);
    expect(deny).toEqual(
      expect.arrayContaining([
        "Edit(.env*)",
        "Edit(*.pem)",
        "Edit(*.key)",
        "Edit(*credentials*)",
      ]),
    );
  });
});

describe("the definitions carry the frontier drill, merge danger and test seams (#2206)", () => {
  // Borrowed from mattpocock/skills on 2026-10-13: ask the whole frontier per
  // round with a recommended answer; say what a merge can break; name the
  // test shapes that pass without proving anything.
  const skill = (name) => read(`.claude/skills/${name}/SKILL.md`);

  it("drill asks the whole frontier per round, with a recommended answer each", () => {
    const drill = skill("drill");
    expect(drill).toMatch(/frontier/i);
    expect(drill).toContain("recommended answer");
    // The policy sentence stays; CLAUDE.md and drill are pinned to it above.
    expect(drill).toContain("A bug with a reproduction gets the minimal drill");
  });

  it("the PR body states its merge danger, in pr and in the implementer's section list", () => {
    for (const file of [
      ".claude/skills/pr/SKILL.md",
      ".claude/agents/implementer.md",
    ]) {
      expect(read(file), file).toContain("## Merge danger");
    }
  });

  it("the testing rule asks for agreed seams and names the two empty test shapes", () => {
    const rule = read(".claude/rules/testing.md");
    expect(rule).toMatch(/seam/i);
    expect(rule).toMatch(/tautolog/i);
    expect(rule).toContain("implementation-coupled");
  });

  it("CLAUDE.md says where a lesson about the owner goes", () => {
    expect(read(".claude/CLAUDE.md")).toContain("~/.claude/rules/");
  });
});

describe("agents ask the code graph before grepping (#2208)", () => {
  // graphify builds a tree-sitter graph of the repo with no model. Its exact-
  // name commands answered "what uses the scheduler" in ~560 tokens where grep
  // took ~2,500; free-text query flooded. Two of its installers would rewire
  // this repo's hooks, so the rule names them as never-run.
  const rule = ".claude/rules/codebase-graph.md";

  it("the graph output is gitignored", () => {
    expect(read(".gitignore")).toMatch(/^graphify-out\/$/m);
  });

  it("the rule points at the general guide and keeps what is specific here", () => {
    const text = read(rule);
    expect(text).toContain("~/.claude/rules/codebase-graph.md");
    expect(text).toContain("requireSession()");
  });

  it("the rule forbids the installer that writes into Husky's directory", () => {
    const text = read(rule);
    expect(text).toContain("graphify hook install");
    expect(text).toContain(".husky/_");
  });

  it("CLAUDE.md points at the rule", () => {
    expect(read(".claude/CLAUDE.md")).toContain(rule);
  });
});

describe("the reviewer asks for direct callers, and grep keeps the count", () => {
  // 2026-10-17, gemini: plain `graphify affected` defaults to depth 2 (callers
  // of callers) and a fresh session reported ~120 callers where grep found
  // 139. `--depth 1 --relation calls` gave 127 of the 139 sites, close but not
  // exact, so the rule names it for callers and keeps grep for the count.
  const reviewer = read(".claude/agents/adversarial-reviewer.md");

  it("names the direct-callers form of graphify affected", () => {
    expect(reviewer).toContain('graphify affected "<fn>()" --depth 1 --relation calls');
  });

  it("keeps grep as the exact count", () => {
    expect(reviewer).toMatch(/grep[^.\n]*exact count/);
  });
});
