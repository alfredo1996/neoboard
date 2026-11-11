import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #2461: a package-mirror outage hung `apt-get` in the Merge E2E Results job
// until its timeout cancelled it. The install is bounded, and the merge step
// still finishes without lcov. Textual, like ci-image-pull.test.mjs.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
const start = CI.indexOf("- name: Merge coverage files");
const STEP = CI.slice(start, CI.indexOf("- name:", start + 10));

describe("Merge E2E Results lcov install (#2461)", () => {
  it("bounds every apt-get call with timeout and never fails the step on it", () => {
    const all = STEP.match(/sudo apt-get/g) ?? [];
    const bounded = STEP.match(/timeout (-k \d+ )?\d+ sudo apt-get[^\n]*\|\| true/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    expect(bounded.length).toBe(all.length);
  });

  it("concatenates the shards when lcov is not installed", () => {
    expect(STEP).toMatch(/if command -v lcov[\s\S]*else[\s\S]*-exec cat/);
    expect(STEP).toMatch(/else\s+echo "::warning::lcov unavailable[\s\S]*-exec cat/);
  });
});
