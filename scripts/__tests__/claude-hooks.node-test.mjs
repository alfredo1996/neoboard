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
  realpathSync,
  symlinkSync,
  utimesSync,
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
    execFileSync("/bin/bash", [join(HOOKS, script)], {
      input: payload,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    });
    return 0;
  } catch (err) {
    return err.status ?? 1;
  }
}

/** Run a hook with any payload, arguments and env. Returns exit code, stdout and stderr. */
function run(script, args, payload, env = {}) {
  try {
    const stdout = execFileSync("/bin/bash", [join(HOOKS, script), ...args], {
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
    });
    return { status: 0, stdout };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
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

describe("connector-agnosticism hook (#1894)", () => {
  // app/ and component/ may know THAT connectors exist, never WHICH. The
  // vitest guard (app/src/lib/__tests__/connector-agnostic.test.ts) is the
  // gate; this is the same rule at edit time. Later PRs in #1893 have to be
  // able to touch a line that already names a connector while migrating it,
  // so the hook blocks an edit only when it ADDS names.
  const edit = (file_path, old_string, new_string, env) =>
    run(
      "check-boundaries.sh",
      [],
      { tool_input: { file_path, old_string, new_string } },
      env,
    ).status;

  test("blocks a connector name introduced under app/src", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/app/src/lib/new-thing.ts`,
        'if (connection.type === "neo4j") return graphOnly();',
      ),
      BLOCK,
    );
  });

  test("blocks a connector label introduced under component/src", () => {
    assert.equal(
      edit(
        `${ROOT}/component/src/components/composed/x.tsx`,
        "<p>Connect a database</p>",
        "<p>Connect a PostgreSQL database</p>",
      ),
      BLOCK,
    );
  });

  test("blocks a URI scheme, which is how `Postgres…` identifiers are caught", () => {
    assert.equal(
      edit(
        `${ROOT}/app/src/lib/x.ts`,
        "const m = manager;",
        "const m = manager as PostgresSchemaManager;",
      ),
      BLOCK,
    );
  });

  test("allows the same name under connection/src, where connectors live", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/connection/src/neo4j/x.ts`,
        'export const type = "neo4j";',
      ),
      0,
    );
  });

  test("allows it under app/src/lib/db — the app's own metadata PostgreSQL", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/app/src/lib/db/new-helper.ts`,
        "// PostgreSQL advisory lock, taken before migrating",
      ),
      0,
    );
  });

  // #1905 put app/src/lib/dev/ on the guard's permanent allowlist; the hook
  // has to agree, or an edit the guard accepts is refused at edit time. A
  // sibling that only shares the prefix gets no pass.
  test("allows it under app/src/lib/dev — dev-only helpers — and not beside it", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        // A file that does not exist: against an existing one the hook only
        // compares counts, and verify-connection-hosts.ts already holds four.
        `${ROOT}/app/src/lib/dev/new-helper.ts`,
        "// a seed URI like `bolt://neoboard-neo4j:7687`",
      ),
      0,
    );
    assert.notEqual(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/app/src/lib/devtools/x.ts`,
        'const t = "neo4j";',
      ),
      0,
    );
  });

  test("allows it in a test, a story and the vendored grammar", () => {
    for (const file of [
      "app/src/lib/__tests__/x.test.ts",
      "component/src/charts/x.stories.tsx",
      "component/src/lib/cypher-lang/x.ts",
    ]) {
      assert.equal(
        runHook("check-boundaries.sh", `${ROOT}/${file}`, 'const t = "neo4j";'),
        0,
        file,
      );
    }
  });

  test("allows an edit that does not increase the count", () => {
    // Migrating a line that already offends: one name before, one after.
    assert.equal(
      edit(
        `${ROOT}/app/src/lib/x.ts`,
        'if (type === "neo4j") {',
        'if (connector.type === "neo4j" && connector.supportsGraphData) {',
      ),
      0,
    );
    // …and one that adds a second name to that line does not get a pass.
    assert.equal(
      edit(
        `${ROOT}/app/src/lib/x.ts`,
        'if (type === "neo4j") {',
        'if (type === "neo4j" || type === "postgresql") {',
      ),
      BLOCK,
    );
  });

  test("a Write is measured against the file on disk", () => {
    const root = mkdtempSync(join(tmpdir(), "agnostic-hook-"));
    const file = join(root, "app/src/legacy.ts");
    mkdirSync(join(root, "app/src"), { recursive: true });
    writeFileSync(file, 'export const kinds = ["neo4j", "postgresql"];\n');
    assert.equal(
      runHook("check-boundaries.sh", file, 'export const kinds = ["neo4j"];\n'),
      0,
      "rewriting a file with fewer names is progress",
    );
    assert.equal(
      runHook(
        "check-boundaries.sh",
        file,
        'export const kinds = ["neo4j", "postgresql", "bolt"];\n',
      ),
      BLOCK,
    );
  });

  test("allows library package names and query-language names", () => {
    assert.equal(
      runHook(
        "check-boundaries.sh",
        `${ROOT}/component/src/charts/x.tsx`,
        [
          'import { InteractiveNvlWrapper } from "@neo4j-nvl/react";',
          'import { cypher } from "@neo4j-cypher/react-codemirror";',
          'const { sql, PostgreSQL } = await import("@codemirror/lang-sql");',
          "const ext = sql({ dialect: PostgreSQL });",
          'const languages = ["cypher", "sql"];',
        ].join("\n"),
      ),
      0,
    );
  });

  test("derives the names from connection/src/*/descriptor.ts, not from a list", () => {
    // A project whose only connector is a made-up one: ITS name is blocked
    // and neo4j — not registered there — is not. No name lives in the hook.
    const root = mkdtempSync(join(tmpdir(), "agnostic-hook-"));
    mkdirSync(join(root, "connection/src/acme"), { recursive: true });
    writeFileSync(
      join(root, "connection/src/acme/descriptor.ts"),
      [
        "export const acmeDescriptor = {",
        '  type: "acmegraph",',
        '  label: "Acme Graph DB",',
        '  category: "database",',
        "  fields: [",
        "    {",
        '      key: "uri",',
        '      label: "Address",',
        '      type: "uri",',
        '      group: "connection",',
        '      placeholder: "sample://localhost:1234",',
        '      protocols: ["acme:", "acme+s:"],',
        "    },",
        '    { key: "region", label: "Region", type: "select", group: "advanced" },',
        "  ],",
        "};",
        "",
      ].join("\n"),
    );
    const env = { CLAUDE_PROJECT_DIR: root };
    const file = `${root}/app/src/x.ts`;
    assert.equal(edit(file, "", 'const t = "acmegraph";', env), BLOCK);
    assert.equal(edit(file, "", "<p>Acme Graph DB</p>", env), BLOCK);
    assert.equal(edit(file, "", 'const s = "acme+s://host";', env), BLOCK);
    assert.equal(edit(file, "", 'const t = "neo4j";', env), 0);
    // Only the connector's OWN type and label, and only its `protocols`: a
    // field's type and label are generic words the app has to be able to say,
    // and a placeholder is not a scheme list.
    for (const generic of ["uri", "Address", "select", "Region", "sample"]) {
      assert.equal(edit(file, "", `const w = "${generic}";`, env), 0, generic);
    }
  });

  test("derives a name for every built-in connector in the real tree", () => {
    // #1897 moved `type`, `label` and the URI schemes from plugin.ts into
    // descriptor.ts. A hook still reading the old file derives NOTHING and
    // exits 0 on every edit — silently. So walk the real connectors and hold
    // the hook to each of them, with no connector's name written here.
    const src = join(ROOT, "connection/src");
    const connectors = readdirSync(src)
      .filter((dir) => existsSync(join(src, dir, "plugin.ts")))
      .map((dir) => {
        const file = join(src, dir, "descriptor.ts");
        assert.ok(
          existsSync(file),
          `connection/src/${dir} has a plugin.ts but no descriptor.ts — the hook cannot see that connector`,
        );
        const text = readFileSync(file, "utf8");
        const top = (key) =>
          new RegExp(`^ {2}${key}:\\s*"([^"]+)"`, "m").exec(text)?.[1];
        const protocols = [
          ...text.matchAll(/protocols:\s*\[([^\]]*)\]/g),
        ].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((p) => p[1]));
        return { dir, type: top("type"), label: top("label"), protocols };
      });
    assert.ok(connectors.length >= 2, "expected at least the two built-ins");
    assert.ok(connectors.some((c) => c.protocols.length > 0));

    const file = `${ROOT}/app/src/lib/new-thing.ts`;
    for (const { dir, type, label, protocols } of connectors) {
      assert.ok(type && label, `${dir}: no top-level type/label found`);
      assert.equal(edit(file, "", `const t = "${type}";`), BLOCK, type);
      assert.equal(edit(file, "", `<p>${label}</p>`), BLOCK, label);
      for (const protocol of protocols) {
        const uri = `const u = "${protocol}//host";`;
        assert.equal(edit(file, "", uri), BLOCK, protocol);
      }
    }
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

describe("E2E commit gate is per checkout (#1926)", () => {
  // One marker under $CLAUDE_PROJECT_DIR was shared by every worktree: an agent
  // editing UI files in its worktree blocked commits everywhere — even in an
  // unrelated repository — and any agent's Playwright run cleared everyone's
  // obligation. The marker now lives in the checkout the edit belongs to.

  const git = (cwd, ...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { cwd, stdio: "pipe", encoding: "utf8" },
    );

  /** A main checkout with one linked worktree, plus an unrelated repository. */
  function checkouts() {
    // realpath: on macOS tmpdir() is a symlink and git reports the real path.
    const base = realpathSync(mkdtempSync(join(tmpdir(), "e2e-scope-")));
    const main = join(base, "main");
    const linked = join(base, "linked");
    const other = join(base, "other");
    for (const dir of [main, other]) {
      mkdirSync(dir);
      git(dir, "init", "-q");
      git(dir, "commit", "-q", "--allow-empty", "-m", "init");
    }
    git(main, "worktree", "add", "-q", linked);
    return { main, linked, other };
  }

  const markerOf = (dir) => join(dir, ".claude/.e2e-needed");

  /** Every hook in every session runs with the MAIN checkout as project dir. */
  const hook = (mode, payload, main) =>
    run("enforce-e2e.sh", [mode], payload, { CLAUDE_PROJECT_DIR: main });

  const editUi = (dir, main) =>
    hook(
      "mark",
      { tool_input: { file_path: `${dir}/app/src/components/x.tsx` } },
      main,
    );

  const commit = (command, cwd, main) =>
    hook("check-commit", { cwd, tool_input: { command } }, main).status;

  test("an edit marks only the checkout it belongs to", () => {
    const { main, linked } = checkouts();
    // The directory does not exist yet: a brand-new file in a new folder.
    editUi(linked, main);
    assert.ok(existsSync(markerOf(linked)), "the worktree was not marked");
    assert.ok(!existsSync(markerOf(main)), "the main checkout was marked");
  });

  test("a marked worktree blocks its own commits and nobody else's", () => {
    const { main, linked, other } = checkouts();
    editUi(linked, main);

    assert.equal(commit("git commit -m x", linked, main), BLOCK);
    assert.equal(commit("cd app && git commit -m x", linked, main), BLOCK);
    // Reaching into the marked worktree from somewhere else is still blocked.
    assert.equal(commit(`git -C ${linked} commit -m x`, main, main), BLOCK);
    assert.equal(commit(`cd ${linked} && git commit -m x`, main, main), BLOCK);
    assert.equal(
      commit(`cd "${linked}" && git commit -m x`, other, main),
      BLOCK,
    );

    assert.equal(commit("git commit -m x", main, main), 0, "main checkout");
    assert.equal(commit("git commit -m x", other, main), 0, "other repo");
    assert.equal(
      commit(`cd ${other} && git commit -m x`, linked, main),
      0,
      "cd into another repo from the marked worktree",
    );
  });

  test("a target the hook cannot resolve fails closed while anything is marked", () => {
    const { main, linked, other } = checkouts();
    const command = 'cd "$WT" && git commit -m x';
    assert.equal(commit(command, other, main), 0, "nothing is marked");
    editUi(linked, main);
    assert.equal(commit(command, other, main), BLOCK);
    assert.equal(commit("git -C $WT commit -m x", other, main), BLOCK);
  });

  test("a Playwright run clears only the checkout it ran in", () => {
    const { main, linked } = checkouts();
    editUi(linked, main);
    editUi(main, main);
    const playwright = (cwd) =>
      hook(
        "clear-on-test",
        {
          cwd,
          tool_input: {
            command: "cd app && npx playwright test e2e/x.spec.ts",
          },
        },
        main,
      );

    playwright(main);
    assert.ok(!existsSync(markerOf(main)), "its own marker survived");
    assert.ok(existsSync(markerOf(linked)), "it cleared another checkout");

    playwright(linked);
    assert.ok(!existsSync(markerOf(linked)));
  });
});

describe("E2E commit gate sees UI changes, however they were written (#1939)", () => {
  // The marker is set only by the Edit/Write hook, so a UI file written through
  // Bash (sed -i, a heredoc, `>`) was committed with no Playwright run and no
  // warning. A run now records the content of every changed UI file; a commit
  // is blocked while a changed UI file holds content no run has seen.

  const git = (cwd, ...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { cwd, stdio: "pipe", encoding: "utf8" },
    );

  /** A main checkout with one linked worktree, each with a committed UI file. */
  function checkouts() {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "e2e-seen-")));
    const main = join(base, "main");
    const linked = join(base, "linked");
    mkdirSync(join(main, "app/src/components/cards"), { recursive: true });
    git(main, "init", "-q");
    writeFileSync(join(main, "app/src/components/x.tsx"), "v1\n");
    writeFileSync(join(main, "app/src/components/cards/card.tsx"), "card\n");
    writeFileSync(join(main, "README.md"), "v1\n");
    git(main, "add", ".");
    git(main, "commit", "-q", "-m", "init");
    git(main, "worktree", "add", "-q", linked);
    return { base, main, linked };
  }

  const hook = (mode, payload, main) =>
    run("enforce-e2e.sh", [mode], payload, { CLAUDE_PROJECT_DIR: main });
  const commit = (command, cwd, main) =>
    hook("check-commit", { cwd, tool_input: { command } }, main).status;
  const playwright = (
    cwd,
    main,
    command = "cd app && npx playwright test e2e/x.spec.ts",
  ) => hook("clear-on-test", { cwd, tool_input: { command } }, main);
  const ui = (dir) => join(dir, "app/src/components/x.tsx");

  test("a UI file written through Bash blocks a commit, staged or not", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "v2\n");
    assert.equal(commit("git commit -m x", main, main), BLOCK, "unstaged");
    // The index is read before `git add` runs in the same command.
    assert.equal(
      commit("git add -A && git commit -m x", main, main),
      BLOCK,
      "add and commit in one call",
    );
    git(main, "add", ".");
    assert.equal(commit("git commit -m x", main, main), BLOCK, "staged");
  });

  test("a first UI file in a repo that has none blocks before any run", () => {
    // Nothing committed and nothing seen: an empty reference set once made
    // every line count as seen (awk's NR == FNR on an empty first input).
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "e2e-first-")));
    git(dir, "init", "-q");
    writeFileSync(join(dir, "README.md"), "x\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "init");
    mkdirSync(join(dir, "app/src/components"), { recursive: true });
    writeFileSync(join(dir, "app/src/components/first.tsx"), "new\n");
    assert.equal(commit("git add -A && git commit -m x", dir, dir), BLOCK);
  });

  test("a run vouches for the content it saw; different content is not vouched for", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "v2\n");
    playwright(main, main);
    assert.equal(commit("git commit -am x", main, main), 0);
    writeFileSync(ui(main), "v3\n");
    assert.equal(commit("git commit -am x", main, main), BLOCK);
    // Back to what the run saw: vouched for again, whatever the file times say.
    writeFileSync(ui(main), "v2\n");
    assert.equal(commit("git commit -am x", main, main), 0);
  });

  test("content copied in after the run counts, whatever its times (cp -p)", () => {
    const { main, base } = checkouts();
    const draft = join(base, "draft.tsx");
    writeFileSync(draft, "draft\n");
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(draft, old, old);
    playwright(main, main);
    execFileSync("cp", ["-p", draft, ui(main)]);
    assert.equal(commit("git commit -am x", main, main), BLOCK);
  });

  test("a rename is vouched for by a run after it, and blocks before one", () => {
    const { main } = checkouts();
    git(main, "mv", "app/src/components/x.tsx", "app/src/components/y.tsx");
    assert.equal(commit("git commit -m x", main, main), BLOCK);
    playwright(main, main);
    assert.equal(commit("git commit -m x", main, main), 0);
  });

  test("a rename in the work tree (git add -N) is checked like any change", () => {
    // Status ` R new NUL old`: the source path is its own entry, not a status.
    const { main } = checkouts();
    execFileSync("mv", [ui(main), join(main, "app/src/components/y.tsx")]);
    writeFileSync(join(main, "app/src/components/y.tsx"), "v2\n");
    git(main, "add", "-N", "app/src/components/y.tsx");
    assert.equal(commit("git add -A && git commit -m x", main, main), BLOCK);
    playwright(main, main);
    assert.equal(commit("git add -A && git commit -m x", main, main), 0);
  });

  test("a directory moved after the run counts, though its files keep their times", () => {
    const { main } = checkouts();
    playwright(main, main);
    execFileSync("mv", [
      join(main, "app/src/components/cards"),
      join(main, "app/src/components/tiles"),
    ]);
    assert.equal(commit("git add -A && git commit -m x", main, main), BLOCK);
  });

  test("a stash round trip does not undo a run", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "v2\n");
    playwright(main, main);
    git(main, "stash", "-q");
    git(main, "stash", "pop", "-q");
    assert.equal(commit("git commit -am x", main, main), 0);
  });

  test("staged content the run did not see is never vouched for", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "staged\n");
    git(main, "add", ".");
    writeFileSync(ui(main), "on disk\n");
    playwright(main, main);
    assert.equal(commit("git commit -m x", main, main), BLOCK, "MM");
    // Staged, then deleted from disk (MD): the staged content is still unseen.
    execFileSync("rm", [ui(main)]);
    assert.equal(commit("git commit -m x", main, main), BLOCK, "MD");
  });

  test("listing the specs, asking for help, or the UI mode is not a run", () => {
    // Ceiling: a command that only mentions a run (a grep, an echo, an issue
    // body) counts as one. The gate is a reminder, not a proof.
    const { main } = checkouts();
    writeFileSync(ui(main), "v2\n");
    for (const command of [
      "cd app && npx playwright test --list",
      "cd app && npx playwright test e2e/x.spec.ts --help",
      "cd app && npx playwright test -h",
      "npm run test:e2e:ui",
    ]) {
      playwright(main, main, command);
      assert.equal(commit("git commit -am x", main, main), BLOCK, command);
    }
    playwright(main, main, "npm run test:e2e");
    assert.equal(commit("git commit -am x", main, main), 0);
  });

  test("a change that is not UI does not block", () => {
    const { main } = checkouts();
    writeFileSync(join(main, "README.md"), "v2\n");
    assert.equal(commit("git commit -am x", main, main), 0);
  });

  test("a UI path git would quote is still seen", () => {
    const { main } = checkouts();
    writeFileSync(join(main, "app/src/components/Café Card.tsx"), "new\n");
    assert.equal(commit("git commit -m x", main, main), BLOCK);
  });

  test("finishing a merge is left to the marker: what git merged in is not blocked", () => {
    // Ceiling: a UI file written through Bash while a merge, cherry-pick,
    // revert or rebase is in progress is not seen; an Edit/Write one is.
    const { main } = checkouts();
    git(main, "switch", "-q", "-c", "other");
    writeFileSync(ui(main), "v1\ntheirs\n");
    writeFileSync(join(main, "README.md"), "theirs\n");
    git(main, "commit", "-q", "-am", "other");
    git(main, "switch", "-q", "-");
    writeFileSync(ui(main), "ours\nv1\n");
    writeFileSync(join(main, "README.md"), "ours\n");
    git(main, "commit", "-q", "-am", "ours");
    // README conflicts; the UI file is auto-merged from both sides.
    assert.throws(() => git(main, "merge", "-q", "other"));
    writeFileSync(join(main, "README.md"), "resolved\n");
    git(main, "add", "README.md");
    assert.equal(commit("git commit --no-edit", main, main), 0);
    hook("mark", { tool_input: { file_path: ui(main) } }, main);
    assert.equal(commit("git commit --no-edit", main, main), BLOCK);
  });

  test("a run counts however it is spelled: env prefixes, wrappers, flags, a pipe", () => {
    for (const command of [
      "cd app && TEST_SERVER_PORT=3400 npx playwright test e2e/x.spec.ts",
      "cd app && env TEST_SERVER_PORT=3400 npx playwright test",
      "cd app && timeout 900 npx playwright test",
      "cd app && npx -y playwright test",
      "cd app && npx playwright test e2e/x.spec.ts | tail -5",
      "CI=1 npm run test:e2e",
      // #1939 round 4: every one of these ran the suite and cleared nothing.
      "cd app && TEST_SERVER_PORT=3400 \\\n  npx playwright test e2e/x.spec.ts",
      'cd app && for s in e2e/a.spec.ts e2e/b.spec.ts; do npx playwright test "$s"; done',
      "cd app && time npx playwright test e2e/x.spec.ts",
      "cd app && if npx playwright test e2e/x.spec.ts; then echo ok; fi",
      "cd app && ./node_modules/.bin/playwright test e2e/x.spec.ts",
      'cd app && DEBUG="pw:api pw:browser" npx playwright test',
      "npx -w app playwright test e2e/x.spec.ts",
      "npm exec -w app -- playwright test e2e/x.spec.ts",
      "cd app && npx playwright test e2e/x.spec.ts 2>&1 | sort -h | tail",
      // A listing first does not hide the run after it (CodeRabbit on #1992).
      "cd app && npx playwright test --list && npx playwright test e2e/x.spec.ts",
    ]) {
      const { main } = checkouts();
      writeFileSync(ui(main), "v2\n");
      playwright(main, main, command);
      assert.equal(commit("git commit -am x", main, main), 0, command);
    }
  });

  test("a finished rebase does not switch the check off", () => {
    // REBASE_HEAD outlives a rebase; only rebase-merge/rebase-apply mean one
    // is in progress.
    const { main } = checkouts();
    git(main, "switch", "-q", "-c", "topic");
    writeFileSync(join(main, "README.md"), "topic\n");
    git(main, "commit", "-q", "-am", "topic");
    git(main, "switch", "-q", "-");
    writeFileSync(join(main, "README.md"), "base\n");
    git(main, "commit", "-q", "-am", "base");
    git(main, "switch", "-q", "topic");
    assert.throws(() => git(main, "rebase", "-q", "-"));
    writeFileSync(join(main, "README.md"), "resolved\n");
    git(main, "add", "README.md");
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "rebase", "--continue"],
      { cwd: main, stdio: "pipe", env: { ...process.env, GIT_EDITOR: "true" } },
    );
    writeFileSync(ui(main), "after the rebase\n");
    assert.equal(commit("git commit -am x", main, main), BLOCK);
  });

  test("content a run saw stays seen: redoing a commit after it is not blocked", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "v2\n");
    playwright(main, main);
    git(main, "commit", "-q", "-am", "wip");
    // A later run on the committed tree, then the commit is undone to redo it.
    playwright(main, main);
    git(main, "reset", "-q", "--soft", "HEAD~1");
    assert.equal(commit("git commit -m redo", main, main), 0);
  });

  test("a staged type change is checked: a symlink staged over a UI file", () => {
    const { main } = checkouts();
    execFileSync("rm", [ui(main)]);
    symlinkSync("../../../README.md", ui(main));
    git(main, "add", ".");
    // Disk back to HEAD's content; the index still holds the symlink.
    execFileSync("rm", [ui(main)]);
    writeFileSync(ui(main), "v1\n");
    assert.equal(commit("git commit -m x", main, main), BLOCK);
  });

  test("a UI file the run could not hash is never recorded as seen", () => {
    // A stub git whose `hash-object --stdin-paths` fails, as it does on an
    // unreadable file. Not a mode-000 file: root reads that anyway.
    const { base, main } = checkouts();
    const realGit = execFileSync("sh", ["-c", "command -v git"], {
      encoding: "utf8",
    }).trim();
    const bin = join(base, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "git"),
      [
        "#!/bin/sh",
        'for a in "$@"; do',
        '  if [ "$a" = --stdin-paths ]; then',
        '    cat >/dev/null; echo "fatal: Unable to hash" >&2; exit 128',
        "  fi",
        "done",
        `exec "${realGit}" "$@"`,
        "",
      ].join("\n"),
    );
    chmodSync(join(bin, "git"), 0o755);
    writeFileSync(join(main, "app/src/components/b.tsx"), "unseen\n");
    run(
      "enforce-e2e.sh",
      ["clear-on-test"],
      {
        cwd: main,
        tool_input: { command: "cd app && npx playwright test e2e/x.spec.ts" },
      },
      { CLAUDE_PROJECT_DIR: main, PATH: `${bin}:${process.env.PATH}` },
    );
    const seen = git(
      main,
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "e2e-seen",
    ).trim();
    assert.doesNotMatch(readFileSync(seen, "utf8"), /^\t/m);
    assert.equal(commit("git add -A && git commit -m x", main, main), BLOCK);
  });

  test("a submodule under a UI directory does not block every commit", () => {
    const { main } = checkouts();
    const sha = git(main, "rev-parse", "HEAD").trim();
    git(
      main,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${sha},app/src/components/sub`,
    );
    assert.equal(commit("git commit -m x", main, main), 0);
  });

  test("a mode-only change carries no new content", () => {
    const { main } = checkouts();
    git(main, "update-index", "--chmod=+x", "app/src/components/x.tsx");
    assert.equal(commit("git commit -m x", main, main), 0);
  });

  test("a squash merge needs a run like any change", () => {
    // Ceiling, on purpose: SQUASH_MSG can outlive an aborted squash, and a
    // leftover marker of an operation would switch the check off (as a
    // leftover REBASE_HEAD did).
    const { main } = checkouts();
    git(main, "switch", "-q", "-c", "other");
    writeFileSync(ui(main), "theirs\n");
    git(main, "commit", "-q", "-am", "other");
    git(main, "switch", "-q", "-");
    git(main, "merge", "-q", "--squash", "other");
    assert.equal(commit("git commit -m squash", main, main), BLOCK);
    playwright(main, main);
    assert.equal(commit("git commit -m squash", main, main), 0);
  });

  test("the block says how to vouch for staged content the run did not see", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "staged\n");
    git(main, "add", ".");
    writeFileSync(ui(main), "on disk\n");
    playwright(main, main);
    const { status, stderr } = hook(
      "check-commit",
      { cwd: main, tool_input: { command: "git commit -m x" } },
      main,
    );
    assert.equal(status, BLOCK);
    assert.match(stderr, /git add/);
  });

  test("a worktree's UI change blocks only that worktree", () => {
    const { main, linked } = checkouts();
    writeFileSync(ui(linked), "v2\n");
    assert.equal(commit("git commit -m x", linked, main), BLOCK);
    assert.equal(commit(`git -C ${linked} commit -m x`, main, main), BLOCK);
    assert.equal(commit("git commit -m x", main, main), 0, "main checkout");
    // A run in the main checkout does not vouch for the worktree.
    playwright(main, main);
    assert.equal(commit("git commit -m x", linked, main), BLOCK);
  });

  test("an unresolvable target checks every checkout", () => {
    const { main, linked } = checkouts();
    const command = 'cd "$WT" && git commit -m x';
    assert.equal(commit(command, main, main), 0, "nothing changed anywhere");
    writeFileSync(ui(linked), "v2\n");
    assert.equal(commit(command, main, main), BLOCK);
  });

  test("the run record lives in git's own directory, never in the working tree", () => {
    const { main } = checkouts();
    writeFileSync(ui(main), "v2\n");
    playwright(main, main);
    assert.equal(
      git(main, "status", "--porcelain", "--untracked-files=all"),
      " M app/src/components/x.tsx\n",
    );
    // Outside any git work tree a run records nothing.
    const plain = realpathSync(mkdtempSync(join(tmpdir(), "e2e-plain-")));
    playwright(plain, main);
    assert.deepEqual(readdirSync(plain), []);
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

  test("the E2E gate's modes are reached by the tools they answer for (#1939)", () => {
    // `mark` was reachable only from Edit|Write, so a UI file written through
    // Bash never set the marker and every test of the script still passed.
    // Pin the wiring itself: check-commit and clear-on-test see every Bash call.
    const wiring = Object.entries(settings.hooks).flatMap(([phase, groups]) =>
      groups.flatMap((g) =>
        (g.hooks ?? []).flatMap((h) => {
          const m = (h.command ?? "").match(/enforce-e2e\.sh (\S+)/);
          return m ? [`${phase} ${g.matcher} ${m[1]}`] : [];
        }),
      ),
    );
    assert.deepEqual(wiring.sort(), [
      "PostToolUse Bash clear-on-test",
      "PostToolUse Edit|Write mark",
      "PreToolUse Bash check-commit",
    ]);
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
