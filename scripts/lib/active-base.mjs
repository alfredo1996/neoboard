/**
 * The branch work should compare against: the highest `release/X.Y` on
 * origin, otherwise `dev` (#1854). Same rule the pr and next skills apply.
 *
 * Pure, so it is testable without git or the network.
 *
 * @param {string} lsRemoteOutput output of `git ls-remote --heads origin`
 * @param {string} [override] an explicit base, e.g. from REVIEW_BASE
 * @returns {string}
 */
export function activeBase(lsRemoteOutput, override) {
  if (override && override.trim()) return override.trim();

  const versions = [];
  for (const line of lsRemoteOutput.split("\n")) {
    const m = /\trefs\/heads\/release\/(\d+(?:\.\d+)*)\s*$/.exec(line);
    if (m) versions.push(m[1].split(".").map(Number));
  }
  if (versions.length === 0) return "dev";

  // Numeric, segment by segment: 1.10 is newer than 1.9.
  versions.sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  return `release/${versions.at(-1).join(".")}`;
}
