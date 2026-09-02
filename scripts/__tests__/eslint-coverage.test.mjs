import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

/**
 * #1547 — `npm run lint` is `eslint .`, and the root config globally ignored
 * `component`, `connection` and `connector-sdk`. None of those has a config of
 * its own, so three of five workspace packages — including the entire UI
 * component library and the whole DB connector layer — had never been linted.
 *
 * That is not a hypothetical gap. `react-hooks/exhaustive-deps` names the
 * #1546 defect exactly ("useMemo has missing dependencies: 'legendPosition'
 * and 'width'"), and it shipped because the rule never ran on that file.
 *
 * `CLAUDE.md` also documented the opposite of the truth: "npm run lint #
 * ESLint all packages (root config)".
 *
 * This asserts a representative source file per package is actually linted, so
 * a future blanket ignore cannot silently switch three packages off again.
 */

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

/** One real source file per package that must be linted. */
const MUST_BE_LINTED = [
  "app/src/lib/shared/normalize-value.ts",
  "component/src/charts/bar-chart.tsx",
  "connection/src/neo4j/Neo4jRecordParser.ts",
  "connector-sdk/src/generalized/NeodashRecord.ts",
  "cli/src/index.ts",
];

/** Deliberately excluded, with the reason recorded here rather than implied. */
const MUST_BE_IGNORED = [
  // Vendored upstream source, modified locally. Excluded from SonarCloud
  // coverage for the same reason.
  "component/src/lib/cypher-lang/cypher.ts",
  "component/dist/index.js",
  "node_modules/eslint/package.json",
];

describe("eslint coverage (#1547)", () => {
  // Repo-relative paths against an explicit cwd. Passing absolute paths here
  // gives wrong answers on macOS, where /var and /tmp are symlinks and the
  // resolved path stops matching the config's ignore patterns.
  const eslint = new ESLint({ cwd: ROOT });

  it.each(MUST_BE_LINTED)("lints %s", async (rel) => {
    expect(await eslint.isPathIgnored(rel)).toBe(false);
  });

  it.each(MUST_BE_IGNORED)("ignores %s", async (rel) => {
    expect(await eslint.isPathIgnored(rel)).toBe(true);
  });

  // Guard: if the paths above ever stop existing the suite must fail loudly
  // rather than assert nothing about files that are not there.
  it("checks paths that actually exist", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const rel of MUST_BE_LINTED) {
      expect(existsSync(join(ROOT, rel)), `${rel} exists`).toBe(true);
    }
  });
});
