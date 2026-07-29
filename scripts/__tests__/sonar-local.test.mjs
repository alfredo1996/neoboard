import { describe, it, expect } from "vitest";
import {
  assertScannableBranch,
  resolveSonarToken,
  missingLcovReports,
  PROTECTED_BRANCHES,
} from "../lib/sonar-local.mjs";

/**
 * Guards for scanning SonarCloud from a developer machine (#1253).
 *
 * The dangerous default: a scanner run with no branch parameters analyses as
 * the project's MAIN branch, overwriting the authoritative SonarCloud analysis
 * with local — possibly partial — results. These guards exist so that cannot
 * happen by accident, so they are tested rather than assumed.
 */

describe("assertScannableBranch", () => {
  it.each(PROTECTED_BRANCHES)("refuses to scan %s", (branch) => {
    expect(() => assertScannableBranch(branch)).toThrow(/protected branch/i);
  });

  it("refuses any release/* branch, not just a literal name", () => {
    expect(() => assertScannableBranch("release/1.4")).toThrow(
      /protected branch/i,
    );
  });

  it("allows a feature branch", () => {
    expect(() => assertScannableBranch("fix/issue-1253-local")).not.toThrow();
  });

  it("allows a protected branch only with an explicit override", () => {
    expect(() => assertScannableBranch("dev", { force: true })).not.toThrow();
  });

  it("refuses an empty or detached-HEAD branch name", () => {
    // Scanning from a detached HEAD would fall back to the default branch.
    expect(() => assertScannableBranch("")).toThrow();
    expect(() => assertScannableBranch("HEAD")).toThrow();
  });
});

describe("resolveSonarToken", () => {
  it("returns the token from the environment", () => {
    expect(resolveSonarToken({ SONAR_TOKEN: "abc123" })).toBe("abc123");
  });

  it("throws a clear error when absent rather than scanning anonymously", () => {
    expect(() => resolveSonarToken({})).toThrow(/SONAR_TOKEN/);
  });

  it("treats a blank token as absent", () => {
    expect(() => resolveSonarToken({ SONAR_TOKEN: "   " })).toThrow(
      /SONAR_TOKEN/,
    );
  });
});

describe("missingLcovReports", () => {
  const props = `
sonar.javascript.lcov.reportPaths=\\
  app/coverage/lcov.info,\\
  app/coverage-e2e/lcov.info,\\
  component/coverage/lcov.info
`;

  it("reports which declared lcov files are absent", () => {
    const missing = missingLcovReports(props, (p) => p !== "app/coverage-e2e/lcov.info");
    expect(missing).toEqual(["app/coverage-e2e/lcov.info"]);
  });

  it("returns nothing when every declared report exists", () => {
    expect(missingLcovReports(props, () => true)).toEqual([]);
  });

  it("parses every declared path, not just the first line", () => {
    expect(missingLcovReports(props, () => false)).toHaveLength(3);
  });
});
