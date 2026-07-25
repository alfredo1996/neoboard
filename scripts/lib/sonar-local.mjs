/**
 * Guards for running the SonarQube scanner against SonarCloud from a
 * developer machine (#1253).
 *
 * The point of scanning locally is to get the REAL quality-gate verdict —
 * same server, same gate config, same new-code definition — before pushing,
 * instead of discovering it on the PR minutes later.
 *
 * The hazard: a scanner run with no branch parameters is analysed as the
 * project's main branch, which would overwrite the authoritative analysis
 * with local, possibly partial results. Everything here exists to make that
 * impossible by accident.
 */

/** Branches whose SonarCloud analysis must only ever come from CI. */
export const PROTECTED_BRANCHES = ["main", "dev", "master"];

/**
 * Throw unless `branch` is safe to analyse from a local machine.
 * `release/*` is protected as a family, not just by literal name.
 */
export function assertScannableBranch(branch, { force = false } = {}) {
  if (!branch || branch === "HEAD") {
    throw new Error(
      "Refusing to scan: could not determine a branch name (detached HEAD?). " +
        "Sonar would fall back to the project's default branch and overwrite it.",
    );
  }
  if (force) return;
  const isProtected =
    PROTECTED_BRANCHES.includes(branch) || branch.startsWith("release/");
  if (isProtected) {
    throw new Error(
      `Refusing to scan protected branch "${branch}" — its analysis must come ` +
        `from CI, or a local run would overwrite it. Pass --force only if you ` +
        `genuinely mean to replace the server-side analysis.`,
    );
  }
}

/** Read SONAR_TOKEN, failing loudly rather than scanning anonymously. */
export function resolveSonarToken(env = {}) {
  const token = (env.SONAR_TOKEN ?? "").trim();
  if (!token) {
    throw new Error(
      "SONAR_TOKEN is not set. Export it, or add it to .env.local — without " +
        "it the scanner would attempt an anonymous analysis and fail late.",
    );
  }
  return token;
}

/**
 * Given the text of sonar-project.properties, return the declared lcov report
 * paths that do not exist. `exists` is injected so this stays pure/testable.
 *
 * Matters because `app/coverage-e2e/lcov.info` only exists after a full
 * Playwright run: scanning without it silently under-reports app coverage and
 * can show a WORSE result than CI, which would be misleading rather than
 * useful.
 */
export function missingLcovReports(propertiesText, exists) {
  const match = propertiesText.match(
    /sonar\.javascript\.lcov\.reportPaths=([\s\S]*?)(?:\n\s*\n|\n(?=[a-z])|$)/i,
  );
  if (!match) return [];
  return match[1]
    .split(",")
    .map((p) => p.replace(/\\/g, "").trim())
    .filter(Boolean)
    .filter((p) => !exists(p));
}
