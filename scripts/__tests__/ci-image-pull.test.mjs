import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// #1922: one Docker Hub connection reset during the E2E job's image pre-pull
// failed a whole shard before any test ran. Every pull now goes through a
// `pull()` helper that retries. Textual, like release-workflow.test.mjs: the
// repo has no YAML parser, and the helper is plain shell inside a `run:` block.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const WORKFLOWS = join(ROOT, ".github/workflows");
const CI = readFileSync(join(WORKFLOWS, "ci.yml"), "utf8");

/** The `pull() { … }` function as written in ci.yml, dedented. */
function pullHelper() {
  const lines = CI.split("\n");
  const start = lines.findIndex((l) => /^\s*pull\(\) \{\s*$/.test(l));
  if (start === -1) return null;
  const indent = lines[start].match(/^\s*/)[0];
  const end = lines.findIndex((l, i) => i > start && l === `${indent}}`);
  return lines
    .slice(start, end + 1)
    .map((l) => l.slice(indent.length))
    .join("\n");
}

/**
 * Run the helper with `docker` failing `failures` times before it succeeds
 * (Infinity: never) and `sleep` stubbed out. Returns the exit status, how many
 * pulls it tried and what it printed.
 */
function runPull(failures) {
  const script = `
    tries=0
    docker() { tries=$((tries + 1)); [ "$tries" -gt ${failures === Infinity ? 999 : failures} ]; }
    sleep() { :; }
    ${pullHelper()}
    pull neo4j:5.26-community
    status=$?
    echo "TRIES=$tries"
    exit $status
  `;
  const { status, stdout } = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
  });
  return {
    status,
    tries: Number(stdout.match(/TRIES=(\d+)/)?.[1]),
    stdout,
  };
}

describe("CI image pulls retry a registry blip (#1922)", () => {
  it("defines the pull helper in ci.yml", () => {
    expect(pullHelper()).not.toBeNull();
  });

  it("never pulls an image except through the helper", () => {
    const bare = readdirSync(WORKFLOWS)
      .filter((f) => f.endsWith(".yml"))
      .flatMap((f) =>
        readFileSync(join(WORKFLOWS, f), "utf8")
          .split("\n")
          .map((line, i) => ({ where: `${f}:${i + 1}`, line: line.trim() }))
          // A line that runs a pull (not a comment or a message about one)…
          .filter(({ line }) => /^docker pull\b/.test(line))
          // …other than the helper's own pull of "$1".
          .filter(({ line }) => !line.startsWith('docker pull "$1"')),
      );
    expect(bare).toEqual([]);
  });

  it("succeeds when a pull fails twice and then works", () => {
    const run = runPull(2);
    expect(run.status).toBe(0);
    expect(run.tries).toBe(3);
  });

  it("gives up after three tries, saying so", () => {
    const run = runPull(Infinity);
    expect(run.status).not.toBe(0);
    expect(run.tries).toBe(3);
    expect(run.stdout).toContain("::error::docker pull neo4j:5.26-community failed");
  });
});
