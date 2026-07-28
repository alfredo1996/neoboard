import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Guards against a build step that is allowed to fail (#1356).
//
// `cli-integration.yml` carried `continue-on-error: true` on "Build connection
// package". The step had never once succeeded — `connection` needs
// `connector-sdk/dist`, which does not exist after a fresh `npm ci` — and the
// flag kept the job green for months. Verified before the fix: exit 1, 42
// TS2307 "Cannot find module '@neoboard/connector-sdk'".
//
// A build allowed to fail is not a build step. If the failure genuinely does
// not matter, the step does not either — delete it instead.
//
// Unlike release-workflow.test.mjs (which is deliberately textual, and says
// so), this one needs to know which step a key belongs to. `continue-on-error`
// is legitimate on a step named "Download E2E coverage" and forbidden two
// lines away on one named "Build" — line-oriented matching cannot tell those
// apart. Hence the small structural parser below rather than a regex.
//
// Not a general YAML parser, and not trying to be: it reads block sequences of
// block mappings, which is the only shape `steps:` ever takes. The repo has no
// YAML parser in its dependency tree and this assertion does not justify
// adding one. The accounting check at the bottom is what keeps that honest —
// if a workflow ever uses a shape this misreads, the counts diverge and the
// test fails loudly rather than quietly asserting nothing.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const WORKFLOW_DIR = join(ROOT, ".github/workflows");

const WORKFLOWS = readdirSync(WORKFLOW_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({
    file: `.github/workflows/${file}`,
    text: readFileSync(join(WORKFLOW_DIR, file), "utf8"),
  }));

const indentOf = (line) => line.length - line.trimStart().length;

/** `key: value` from one mapping line, or null if the line is not a key. */
function readKey(text) {
  const m = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(text);
  return m ? { key: m[1], value: (m[2] ?? "").trim() } : null;
}

/**
 * Every step in one workflow, as { file, job, name, keys }.
 *
 * Walks `steps:` blocks by indentation. A line at the sequence indent starting
 * with `- ` opens a step; lines at that step's key column are its keys;
 * anything deeper is a nested mapping (`with:`) or a block scalar body
 * (`run: |`) and is skipped — which is why a heredoc containing `- name:`
 * cannot be mistaken for a step.
 */
function parseSteps({ file, text }) {
  const lines = text.split("\n");
  const steps = [];
  let job = null;
  let i = 0;

  while (i < lines.length) {
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (jobMatch) {
      job = jobMatch[1];
      i++;
      continue;
    }
    if (!/^\s*steps:\s*$/.test(lines[i])) {
      i++;
      continue;
    }

    const stepsIndent = indentOf(lines[i]);
    let seqIndent = null;
    let keyIndent = null;
    let current = null;
    i++;

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      const ind = indentOf(line);
      // A comment at or above the steps: indent could be the start of the
      // next block; one deeper is inside the sequence. Either way it is not
      // a key, so skip it without ending the block.
      if (/^\s*#/.test(line)) continue;
      if (ind <= stepsIndent) break; // steps block ended

      const item = /^(\s*-\s+)(\S.*)$/.exec(line);
      if (item && (seqIndent === null || ind === seqIndent)) {
        seqIndent = ind;
        keyIndent = item[1].length;
        current = { file, job, name: null, keys: new Map(), line: i + 1 };
        steps.push(current);
        const kv = readKey(item[2]);
        if (kv) current.keys.set(kv.key, kv.value);
        continue;
      }
      if (current && ind === keyIndent) {
        const kv = readKey(line.trim());
        if (kv) current.keys.set(kv.key, kv.value);
      }
    }
  }

  for (const step of steps) step.name = step.keys.get("name") ?? null;
  return steps;
}

const STEPS = WORKFLOWS.flatMap(parseSteps);

/** A step's identity in a failure message: file:line "name". */
const label = (s) => `${s.file}:${s.line} "${s.name ?? s.keys.get("uses")}"`;

/**
 * Whether `continue-on-error` is set to anything other than a literal false.
 *
 * `${{ github.event_name == 'push' }}` counts as set: a build step whose
 * failure tolerance is computed is still a build step that can silently fail,
 * and this guard should not be the thing that decides the expression is safe.
 */
function toleratesFailure(step) {
  if (!step.keys.has("continue-on-error")) return false;
  const raw = step.keys.get("continue-on-error").replace(/\s+#.*$/, "");
  return raw !== "false";
}

describe("workflow guard: build steps are not allowed to fail (#1356)", () => {
  it("parses steps out of every workflow", () => {
    // Vacuity guard. Every assertion below filters this list; if the parser
    // silently returned nothing, they would all pass while checking nothing.
    expect(WORKFLOWS.length).toBeGreaterThan(0);
    for (const { file } of WORKFLOWS) {
      const mine = STEPS.filter((s) => s.file === file);
      expect(mine.length, `no steps parsed from ${file}`).toBeGreaterThan(0);
      expect(
        mine.every((s) => s.name || s.keys.has("uses") || s.keys.has("run")),
        `${file} produced a step with no name, uses or run — parser drift`,
      ).toBe(true);
    }
  });

  it("finds build-named steps to check", () => {
    // The second vacuity guard, and the one that matters most. The assertion
    // below is "no build step tolerates failure"; if `name` ever stopped being
    // populated, that set would be empty and pass for the wrong reason.
    const buildSteps = STEPS.filter((s) => /build/i.test(s.name ?? ""));
    expect(
      buildSteps.length,
      "no step named *build* found — the guard below would be vacuous",
    ).toBeGreaterThan(0);
  });

  it("has no build step carrying continue-on-error", () => {
    const offenders = STEPS.filter(
      (s) => /build/i.test(s.name ?? "") && toleratesFailure(s),
    ).map(label);

    // A build step that is permitted to fail proves nothing about the build.
    // Make it fail loudly, or delete the step.
    expect(offenders).toEqual([]);
  });

  it("accounts for every continue-on-error in the workflow", () => {
    // Keeps the parser honest. Each `continue-on-error:` in the source must
    // have landed on a parsed step; a mismatch means either the parser
    // misread a workflow, or the key was used at JOB level — where it exempts
    // every step inside, including build steps, and this guard cannot see it.
    // Either way a human should look, so fail rather than pass quietly.
    for (const { file, text } of WORKFLOWS) {
      const raw = (text.match(/^\s*continue-on-error:/gm) ?? []).length;
      const parsed = STEPS.filter(
        (s) => s.file === file && s.keys.has("continue-on-error"),
      ).length;
      expect(
        parsed,
        `${file}: ${raw} continue-on-error in source, ${parsed} attributed to steps`,
      ).toBe(raw);
    }
  });
});

describe("connector-sdk builds itself on install (#1356)", () => {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, "connector-sdk/package.json"), "utf8"),
  );

  it("has a prepare script", () => {
    // `connector-sdk/dist` is gitignored and every other workspace compiles
    // against it via `types: dist/index.d.ts`. Without `prepare`, a fresh
    // clone or worktree installs cleanly and then fails to build with 42
    // TS2307s — the trap that cost two agents an afternoon each and kept the
    // CLI-integration build step red-but-hidden for months.
    expect(pkg.scripts?.prepare, "connector-sdk has no prepare script").toBeTruthy();
  });

  it("actually builds in prepare, rather than merely defining one", () => {
    // `"prepare": "echo ok"` would satisfy the check above and leave dist
    // empty. Require it to reach the real compile.
    const prepare = pkg.scripts?.prepare ?? "";
    const build = pkg.scripts?.build ?? "";
    expect(build, "connector-sdk has no build script").toBeTruthy();
    expect(
      prepare.includes("run build") || prepare.includes(build),
      `prepare (${prepare}) does not run the build (${build})`,
    ).toBe(true);
  });

  it("guards prepare on the source being present", () => {
    // The Dockerfile's deps stage copies ONLY the package manifests and then
    // runs `npm ci`, so `prepare` fires in a directory with no src/ and no
    // tsconfig.build.json. Unguarded, that fails the whole image build:
    //   npm error error TS5058: The specified path does not exist:
    //   'tsconfig.build.json'
    // — verified by replaying that stage. This mirrors the trick the root
    // postinstall already uses (`[ ! -d "cli/src" ] || ...`).
    //
    // If the Dockerfile ever copies source before installing, this guard
    // stops being load-bearing and this test should go with it.
    const prepare = pkg.scripts?.prepare ?? "";
    expect(
      prepare.includes("src"),
      `prepare (${prepare}) runs unconditionally — it must no-op when src/ is absent`,
    ).toBe(true);
  });

  it("still points its published types at the directory prepare produces", () => {
    // The two halves have to agree. If `types`/`exports` moved off dist,
    // prepare would be building something nothing consumes.
    expect(pkg.types).toMatch(/^dist\//);
    expect(pkg.exports?.["."]?.types).toMatch(/^\.\/dist\//);
  });
});
