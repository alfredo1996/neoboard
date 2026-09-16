import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * #1634 — the Claude Code hooks had no tests.
 *
 * CLAUDE.md presents them as automated enforcement of the project's most
 * important rules: package boundaries, query interpolation, credential
 * logging, migration immutability. There are nine scripts plus several inline
 * commands and nothing exercised any of them — `.claude/` sits outside every
 * CI path filter, and `test:scripts` explicitly excludes it.
 *
 * One of them was quietly wrong as a result. A PreToolUse hook blocked
 * `@testing-library/react` anywhere under `app/src/**\/__tests__`, while 63
 * files there already import it and CLAUDE.md prescribes exactly that for the
 * jsdom project. A guardrail pointing at the wrong lane, for months.
 *
 * Each case below gives a hook one input it MUST block and one it MUST allow.
 * A guard with no negative control proves only that it does not crash.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/[/]$/, "");
const HOOKS = join(ROOT, ".claude/hooks");

/** Run a hook with a tool-call payload. Returns its exit code. */
function runHook(script, filePath, content) {
  const payload = JSON.stringify({
    tool_input: { file_path: filePath, content },
  });
  try {
    execFileSync("bash", [join(HOOKS, script)], {
      input: payload,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
}

/** Run a hook with any payload, arguments and env. Returns exit code and stdout. */
function run(script, args, payload, env = {}) {
  try {
    const stdout = execFileSync("bash", [join(HOOKS, script), ...args], {
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

const BLOCK = 2;

describe("package boundary hook", () => {
  test("blocks component/ importing from app/", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/component/src/charts/x.tsx`,
        'import { thing } from "@/app/lib/thing";',
      ),
      BLOCK,
    );
  });

  test("blocks connection/ importing React", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/connection/src/x.ts`,
        'import React from "react";',
      ),
      BLOCK,
    );
  });

  test("allows component/ importing from its own package", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/component/src/charts/x.tsx`,
        'import { cn } from "@/lib/utils";',
      ),
      0,
    );
  });
});

describe("query safety hook", () => {
  // Scoped to connection/src and API routes. app/src/lib is deliberately out:
  // lib/db writes Drizzle `sql` templates whose ${} interpolation IS the
  // parameterised form, so the guard would fire on the correct pattern.
  const route = `${ROOT}/app/src/app/api/things/route.ts`;

  test("blocks an interpolated SQL keyword", () => {
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        "const q = `SELECT * FROM users WHERE id = ${userId}`;",
      ),
      BLOCK,
    );
  });

  test("blocks interpolation in a multi-line query template", () => {
    // Queries are usually written across lines. The guard only compared
    // keyword and ${} on the same line, so this passed.
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        "const q = `\n  SELECT *\n  FROM users\n  WHERE id = ${userId}\n`;",
      ),
      BLOCK,
    );
  });

  test("blocks an interpolated Cypher pattern", () => {
    assert.equal(
      runHook(
        "check-query-safety.sh",
        `${ROOT}/connection/src/neo4j/x.ts`,
        "await session.run(`MATCH (n:${label}) RETURN n`);",
      ),
      BLOCK,
    );
  });

  test("blocks a lowercase query, which both engines accept", () => {
    // Postgres and Neo4j do not care about keyword case. Matching upper case
    // only would let untrusted input through in lowercase.
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        "const q = `select * from users where id = ${userId}`;",
      ),
      BLOCK,
    );
  });

  test("blocks string concatenation into a query", () => {
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        'const q = "SELECT * FROM users WHERE id = " + userId;',
      ),
      BLOCK,
    );
  });

  test("blocks a Cypher literal that quotes an identifier with backticks", () => {
    // An escaped backtick ends the literal for a naive [^`]* match, splitting
    // the query into fragments that no longer look like one.
    assert.equal(
      runHook(
        "check-query-safety.sh",
        `${ROOT}/connection/src/neo4j/x.ts`,
        "const q = `MATCH (n:\\`User\\`) WHERE n.id = ${id} RETURN n`;",
      ),
      BLOCK,
    );
  });

  test("blocks concatenation when the SQL contains an apostrophe", () => {
    // A character class excluding both quote styles stops at the inner
    // apostrophe, so the string never matches as a query.
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        "const q = \"SELECT * FROM users WHERE tenant = 'public' AND id = \" + id;",
      ),
      BLOCK,
    );
  });

  test("allows a parameterised query", () => {
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        'const q = "SELECT * FROM users WHERE id = $1";',
      ),
      0,
    );
  });

  test("allows an error message that interpolates an id (#1843)", () => {
    // The guard matched keywords in any case, so `return` on the same line as
    // a ${} blocked this ordinary line in every API route.
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        "return NextResponse.json({ error: `Widget ${id} not found` }, { status: 404 });",
      ),
      0,
    );
  });

  test("allows English that happens to use query words", () => {
    assert.equal(
      runHook(
        "check-query-safety.sh",
        route,
        'throw new Error(`Could not create or delete ${name} with these settings`);\nconst label = "Delete " + name;',
      ),
      0,
    );
  });

  test("ignores a file outside its scope", () => {
    assert.equal(
      runHook(
        "check-query-safety.sh",
        `${ROOT}/component/src/x.ts`,
        "const q = `SELECT ${x}`;",
      ),
      0,
    );
  });
});

describe("credential logging hook", () => {
  test("blocks logging a decrypted credential", () => {
    assert.equal(
      runHook(
        "check-credential-logging.sh",
        `${ROOT}/app/src/lib/x.ts`,
        "console.log(password);",
      ),
      BLOCK,
    );
  });

  test("allows an ordinary log line", () => {
    assert.equal(
      runHook(
        "check-credential-logging.sh",
        `${ROOT}/app/src/lib/x.ts`,
        'console.log("connection established");',
      ),
      0,
    );
  });
});

describe("E2E commit gate (#1843)", () => {
  /** A throwaway project dir, with or without the "UI edited, E2E not run" marker. */
  function project({ marker }) {
    const dir = mkdtempSync(join(tmpdir(), "e2e-gate-"));
    mkdirSync(join(dir, ".claude"));
    if (marker) {
      writeFileSync(
        join(dir, ".claude/.e2e-needed"),
        `${dir}/app/src/components/x.tsx\n`,
      );
    }
    return dir;
  }

  const gate = (mode, command, dir) =>
    run(
      "enforce-e2e.sh",
      [mode],
      { tool_input: { command } },
      {
        CLAUDE_PROJECT_DIR: dir,
      },
    ).status;

  test("blocks git commit however the command is spelled", () => {
    // `^\s*git commit` let `cd app && git commit` straight through.
    const dir = project({ marker: true });
    for (const command of [
      "git commit -m x",
      "cd app && git commit -m x",
      "npm test; git commit -am wip",
      "GIT_EDITOR=true git commit",
      "git -C app commit -m x",
      'git -c user.name=bot commit -m "x"',
      "git --no-pager commit -m x",
    ]) {
      assert.equal(gate("check-commit", command, dir), BLOCK, command);
    }
  });

  test("allows commands that only mention a commit", () => {
    const dir = project({ marker: true });
    for (const command of [
      "git status",
      'echo "git commit"',
      "git log --grep commit",
      "git commit-tree HEAD^{tree}",
    ]) {
      assert.equal(gate("check-commit", command, dir), 0, command);
    }
  });

  test("allows git commit when no UI file is waiting on E2E", () => {
    assert.equal(
      gate("check-commit", "git commit -m x", project({ marker: false })),
      0,
    );
  });

  test("listing the specs is not running them", () => {
    const dir = project({ marker: true });
    const marker = join(dir, ".claude/.e2e-needed");
    gate("clear-on-test", "cd app && npx playwright test --list", dir);
    assert.ok(existsSync(marker), "--list cleared the marker");
    gate(
      "clear-on-test",
      "cd app && npx playwright test e2e/widgets.spec.ts",
      dir,
    );
    assert.ok(!existsSync(marker), "a real run left the marker behind");
  });
});

describe("format-and-lint hook (#923, #1843)", () => {
  // `next lint` was removed in Next.js 16 and the hook sent its error to
  // /dev/null, so app/ files were never linted after an edit. npx is stubbed:
  // the contract under test is what the hook does with ESLint's verdict.

  /** A PATH whose `npx` records its arguments and fakes ESLint's output. */
  function stubNpx(eslintOutput) {
    const dir = mkdtempSync(join(tmpdir(), "npx-stub-"));
    const log = join(dir, "calls.log");
    const verdict = join(dir, "eslint-output.txt");
    writeFileSync(verdict, eslintOutput);
    writeFileSync(
      join(dir, "npx"),
      [
        "#!/bin/bash",
        `echo "$*" >> "${log}"`,
        'case "$*" in',
        `  *eslint*) if [ -s "${verdict}" ]; then cat "${verdict}"; exit 1; fi ;;`,
        "esac",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(join(dir, "npx"), 0o755);
    return { log, env: { PATH: `${dir}:${process.env.PATH}` } };
  }

  const file = `${ROOT}/app/src/lib/x.ts`;
  const edit = (path) => ({ tool_input: { file_path: path } });
  const ESLINT_ERRORS = [
    "",
    file,
    "  3:7  error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars",
    "",
    "✖ 1 problem (1 error, 0 warnings)",
    "",
  ].join("\n");

  test("hands Claude the errors eslint --fix could not fix, without blocking", () => {
    const npx = stubNpx(ESLINT_ERRORS);
    const { status, stdout } = run(
      "format-and-lint.sh",
      [],
      edit(file),
      npx.env,
    );
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(out.hookSpecificOutput.additionalContext, /no-unused-vars/);
  });

  test("says nothing when the file lints clean", () => {
    const npx = stubNpx("");
    const { status, stdout } = run(
      "format-and-lint.sh",
      [],
      edit(file),
      npx.env,
    );
    assert.equal(status, 0);
    assert.equal(stdout.trim(), "");
    assert.match(readFileSync(npx.log, "utf8"), /eslint --fix/);
  });

  test("does not lint a file that is not TypeScript", () => {
    const npx = stubNpx(ESLINT_ERRORS);
    run("format-and-lint.sh", [], edit(`${ROOT}/README.md`), npx.env);
    const calls = existsSync(npx.log) ? readFileSync(npx.log, "utf8") : "";
    assert.doesNotMatch(calls, /eslint/);
  });
});

describe("the settings.json inline hooks", () => {
  const settings = JSON.parse(
    readFileSync(join(ROOT, ".claude/settings.json"), "utf8"),
  );
  const commands = settings.hooks.PreToolUse.flatMap((g) =>
    (g.hooks ?? []).map((h) => h.command ?? ""),
  );

  /** Run one inline hook command with a payload. */
  function runInline(command, filePath, content) {
    const payload = JSON.stringify({
      tool_input: { file_path: filePath, content },
    });
    try {
      execFileSync("bash", ["-c", command], {
        input: payload,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
      });
      return 0;
    } catch (err) {
      return err.status ?? 1;
    }
  }

  const echartsHook = commands.find((c) => c.includes("Never import * from"));
  const ssrHook = commands.find((c) => c.includes("ssr: false"));

  test("the ECharts guard blocks a barrel import", () => {
    assert.ok(echartsHook, "no ECharts hook found in settings.json");
    assert.equal(
      runInline(
        echartsHook,
        `${ROOT}/component/src/charts/x.tsx`,
        'import * as echarts from "echarts";',
      ),
      BLOCK,
    );
  });

  test("the ECharts guard allows a modular import", () => {
    assert.equal(
      runInline(
        echartsHook,
        `${ROOT}/component/src/charts/x.tsx`,
        'import * as echarts from "echarts/core";',
      ),
      0,
    );
  });

  test("the SSR guard blocks a chart component without ssr: false", () => {
    assert.ok(ssrHook, "no SSR hook found in settings.json");
    assert.equal(
      runInline(
        ssrHook,
        `${ROOT}/app/src/components/my-chart.tsx`,
        'import { BarChart } from "echarts/charts";',
      ),
      BLOCK,
    );
  });

  test("the SSR guard allows a dynamic import with ssr: false", () => {
    assert.equal(
      runInline(
        ssrHook,
        `${ROOT}/app/src/components/my-chart.tsx`,
        'const C = dynamic(() => import("echarts"), { ssr: false });',
      ),
      0,
    );
  });

  test("no hook blocks the documented jsdom test convention", () => {
    // CLAUDE.md: "`component` (jsdom): `.test.tsx` files — render tests with
    // `@testing-library/react`". A hook forbade exactly that under app/src,
    // while 63 files there already did it (#1634).
    const testFile = `${ROOT}/app/src/components/__tests__/widget.test.tsx`;
    const source = 'import { render } from "@testing-library/react";';
    for (const command of commands) {
      assert.notEqual(
        runInline(command, testFile, source),
        BLOCK,
        `a PreToolUse hook blocks the house convention:\n${command.slice(0, 160)}`,
      );
    }
  });
});

describe("settings.json and .claude/hooks agree (#1843)", () => {
  const settings = JSON.parse(
    readFileSync(join(ROOT, ".claude/settings.json"), "utf8"),
  );
  const commands = Object.values(settings.hooks)
    .flat()
    .flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ""));
  const referenced = new Set(
    commands.flatMap((c) =>
      [...c.matchAll(/\.claude\/hooks\/([\w-]+\.sh)/g)].map((m) => m[1]),
    ),
  );
  const scripts = readdirSync(HOOKS).filter((f) => f.endsWith(".sh"));

  test("every hook script settings.json runs exists", () => {
    assert.deepEqual(
      [...referenced].filter((s) => !scripts.includes(s)),
      [],
    );
  });

  test("every script in .claude/hooks is wired up", () => {
    // check-migration-guard.sh sat here while CLAUDE.md listed it as an active
    // guardrail. settings.json never ran it.
    assert.deepEqual(
      scripts.filter((s) => !referenced.has(s)),
      [],
    );
  });

  test("no hook reads tool_result, a field Claude Code does not send", () => {
    // PostToolUse delivers a tool's output as `tool_response`. A coverage hook
    // read `.tool_result.stdout`, so it never fired.
    assert.deepEqual(
      scripts.filter((s) =>
        readFileSync(join(HOOKS, s), "utf8").includes("tool_result"),
      ),
      [],
    );
  });
});

describe("agent instructions only name things that exist (#1843)", () => {
  test("nothing tells an agent to run `next lint`", () => {
    // Next.js 16 removed it, so every agent that followed these instructions
    // spent a turn on `error: unknown option '--fix'`.
    const files = execFileSync(
      "git",
      ["ls-files", "-z", ".claude", "DEVELOPMENT.md", "app/package.json"],
      { cwd: ROOT, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    assert.deepEqual(
      files.filter((f) =>
        readFileSync(join(ROOT, f), "utf8").includes("next lint"),
      ),
      [],
    );
  });

  test("every skill file is named SKILL.md", () => {
    // Claude Code loads skills from `SKILL.md`. `skill.md` works only on a
    // case-insensitive filesystem, so a Linux session never saw design-review.
    const skills = join(ROOT, ".claude/skills");
    assert.deepEqual(
      readdirSync(skills).filter(
        (d) => !readdirSync(join(skills, d)).includes("SKILL.md"),
      ),
      [],
    );
  });
});
