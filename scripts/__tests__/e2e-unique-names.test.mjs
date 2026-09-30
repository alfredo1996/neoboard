import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Two fullyParallel workers can run the same beforeEach in the same
// millisecond, so a name built from Date.now() alone is not unique: two
// templates named "E2E Tmpl <ms>" failed a strict locator (#2134). Name
// fixtures with uid() from app/e2e/fixtures.ts. Timing uses (t0, start) are
// fine.
const E2E = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/e2e");
const NAME_FROM_CLOCK = [
  /\$\{Date\.now\(\)\}/,
  /\b(timestamp|stamp)\s*=\s*Date\.now\(\)/,
];

const flagged = (line) => NAME_FROM_CLOCK.some((re) => re.test(line));

describe("E2E fixture names (#2134)", () => {
  it("no E2E file builds a fixture name from Date.now() alone", () => {
    const offenders = readdirSync(E2E, { recursive: true })
      .filter((f) => f.endsWith(".ts"))
      .flatMap((f) =>
        readFileSync(resolve(E2E, f), "utf8")
          .split("\n")
          .map((line, i) => (flagged(line) ? `${f}:${i + 1}` : null))
          .filter(Boolean),
      );
    expect(offenders).toEqual([]);
  });

  it.each([
    ["const name = `E2E Tmpl ${Date.now()}`;", true],
    ["const stamp = Date.now();", true],
    ["const t0 = Date.now();", false],
    ["const name = `E2E Tmpl ${uid()}`;", false],
  ])("%s → flagged %s", (line, expected) => {
    expect(flagged(line)).toBe(expected);
  });
});
