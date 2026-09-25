import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The root postinstall builds the CLI and links it as the machine's global
 * `neoboard` (#1914). A linked git worktree must not take that link over: the
 * worktree is usually a throwaway, and once it is removed `neoboard` points at
 * a directory that no longer exists.
 *
 * `npm` is a stub on PATH that records its arguments, so nothing here builds
 * or links for real.
 */

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../postinstall.sh",
);

let root;
let stubDir;
let log;

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function run(cwd, env = {}) {
  writeFileSync(log, "");
  const r = spawnSync("sh", [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "",
      PATH: `${stubDir}:${process.env.PATH}`,
      ...env,
    },
  });
  return { ...r, npm: readFileSync(log, "utf8") };
}

before(() => {
  root = mkdtempSync(join(tmpdir(), "postinstall-"));
  stubDir = join(root, "bin");
  log = join(root, "npm.log");
  mkdirSync(stubDir);
  writeFileSync(join(stubDir, "npm"), `#!/bin/sh\necho "$*" >> "${log}"\n`);
  chmodSync(join(stubDir, "npm"), 0o755);

  const main = join(root, "main");
  mkdirSync(join(main, "cli/src"), { recursive: true });
  writeFileSync(join(main, "cli/src/index.ts"), "");
  git(main, "init", "-q");
  git(main, "-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x");
  git(main, "worktree", "add", "-q", join(root, "wt"));
});

after(() => rmSync(root, { recursive: true, force: true }));

describe("scripts/postinstall.sh", () => {
  it("builds and links the CLI in the primary checkout", () => {
    const r = run(join(root, "main"));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.npm, /-w cli run build/);
    assert.match(r.npm, /link \.\/cli/);
  });

  it("builds but does not link in a linked worktree", () => {
    const r = run(join(root, "wt"));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.npm, /-w cli run build/);
    assert.doesNotMatch(r.npm, /link/);
    assert.match(r.stdout, /worktree/);
  });

  it("does nothing under CI", () => {
    const r = run(join(root, "main"), { CI: "true" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.npm, "");
  });

  it("does nothing in a checkout without the CLI sources", () => {
    const bare = join(root, "no-cli");
    mkdirSync(bare);
    const r = run(bare);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.npm, "");
  });

  it("fails when the CLI build fails, and does not link", () => {
    writeFileSync(
      join(stubDir, "npm"),
      `#!/bin/sh\necho "$*" >> "${log}"\n[ "$3" = run ] && exit 7\nexit 0\n`,
    );
    try {
      const r = run(join(root, "main"));
      assert.notEqual(r.status, 0);
      assert.doesNotMatch(r.npm, /link/);
    } finally {
      writeFileSync(join(stubDir, "npm"), `#!/bin/sh\necho "$*" >> "${log}"\n`);
    }
  });
});
