import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #2279: a slow apt mirror made the Chromium install eat the unit job's 20
// minutes; the coverage upload came after it, was skipped, and SonarCloud
// failed the coverage gate. Textual, like ci-image-pull.test.mjs.

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

/** [name, text] of each step of job `unit-tests`. */
function unitSteps() {
  const job = CI.split(/^ {2}unit-tests:\n/m)[1].split(/^ {2}\S.*:\n/m)[0];
  return job
    .split(/^ {6}- name: /m)
    .slice(1)
    .map((c) => [c.split("\n")[0], c]);
}

describe("unit-tests job coverage and Chromium steps (#2279)", () => {
  const steps = unitSteps();
  const names = steps.map(([n]) => n);
  const upload = names.indexOf("Upload unit coverage");
  const install = names.indexOf("Install Chromium for the browser test project");

  it("uploads coverage before the Chromium install", () => {
    expect(upload).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(-1);
    expect(upload).toBeLessThan(install);
  });

  it("caps the Chromium install with its own timeout", () => {
    expect(steps[install][1]).toMatch(/^ {8}timeout-minutes: \d+$/m);
  });
});
