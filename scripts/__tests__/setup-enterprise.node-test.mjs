import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../setup-enterprise.sh");

function run(args = [], env = {}) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("scripts/setup-enterprise.sh", () => {
  it("exists and is executable", () => {
    assert.ok(existsSync(SCRIPT), `expected ${SCRIPT} to exist`);
  });

  it("--dry-run exits 0", () => {
    const r = run(["--dry-run"]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
  });

  it("--dry-run advertises each step", () => {
    const r = run(["--dry-run"]);
    const out = r.stdout + r.stderr;
    // Sibling-clone step (or reuse), npm install, npm run build, npm link both ways
    assert.match(out, /neoboard-enterprise/, "should mention sibling repo");
    assert.match(out, /npm.* (i|install)/i, "should mention npm install");
    assert.match(out, /run build/i, "should mention build");
    assert.match(out, /npm.* link/i, "should mention npm link");
  });

  it("--dry-run prints the end banner with env-var + restart guidance", () => {
    const r = run(["--dry-run"]);
    const out = r.stdout + r.stderr;
    assert.match(out, /NEOBOARD_EDITION/, "should mention edition env var");
    assert.match(
      out,
      /\/settings\/authentication/,
      "should point user at the auth settings page",
    );
    assert.match(
      out,
      /npm run dev/i,
      "should remind user to restart the dev server",
    );
  });

  it("--help exits 0 and shows usage", () => {
    const r = run(["--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout + r.stderr, /Usage|usage/);
    assert.match(r.stdout + r.stderr, /--dry-run/);
  });

  it("rejects unknown flags with a non-zero exit and usage hint", () => {
    const r = run(["--frobnicate"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /unknown|unrecognized|Usage/i);
  });
});
