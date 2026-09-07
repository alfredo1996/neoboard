import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
