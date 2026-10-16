import { execFileSync } from "node:child_process";

/**
 * The branch work should start from and compare against (#1854, #2234):
 *
 * 1. a `vX.Y.Z` milestone: `release/X.Y.Z`, else `release/X.Y`, if it exists;
 * 2. a `vX.Y` milestone: `release/X.Y`, if it exists;
 * 3. otherwise the highest `release/X.Y` on origin;
 * 4. otherwise `dev`.
 *
 * Pure, so it is testable without git or the network.
 *
 * @param {string} lsRemoteOutput output of `git ls-remote --heads origin`
 * @param {string} [override] an explicit base, e.g. from REVIEW_BASE
 * @param {string} [milestone] the issue's milestone title, e.g. "v1.6.1"
 * @returns {string}
 */
export function activeBase(lsRemoteOutput, override, milestone) {
  if (override && override.trim()) return override.trim();

  const branches = [];
  for (const line of lsRemoteOutput.split("\n")) {
    const m = /\trefs\/heads\/release\/(\d+(?:\.\d+)*)\s*$/.exec(line);
    if (m) branches.push(m[1]);
  }
  if (branches.length === 0) return "dev";

  // "v1.6.1" tries 1.6.1 then 1.6; "v1.7 — Hastings: …" tries 1.7.
  const v = /^v(\d+\.\d+)(\.\d+)?(?![.\d])/.exec(milestone?.trim() ?? "");
  if (v) {
    const own = [v[1] + (v[2] ?? ""), v[1]].find((b) => branches.includes(b));
    if (own) return `release/${own}`;
  }

  // Numeric, segment by segment: 1.10 is newer than 1.9.
  const versions = branches.map((b) => b.split(".").map(Number));
  versions.sort((a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  return `release/${versions.at(-1).join(".")}`;
}

/** Runs a command; a stalled connection times out and throws. */
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

/**
 * `activeBase` for an issue, read from origin and GitHub. The issue defaults
 * to the `issue-<N>` in the current branch name.
 *
 * @param {{ issue?: string, override?: string }} [options]
 * @returns {string}
 */
export function resolveBase({ issue, override } = {}) {
  let refs = "";
  try {
    refs = run("git", ["ls-remote", "--heads", "origin", "release/*"]);
  } catch {
    console.warn(
      "Could not list origin's release branches; falling back to dev.",
    );
  }

  let n = issue?.match(/\d+/)?.[0];
  if (!n) {
    try {
      n = /issue-(\d+)/.exec(run("git", ["branch", "--show-current"]))?.[1];
    } catch {
      // Detached or not a repository: no issue, so the newest release branch.
    }
  }

  let milestone = "";
  if (n) {
    try {
      milestone = run("gh", [
        "api",
        `repos/{owner}/{repo}/issues/${n}`,
        "--jq",
        '.milestone.title // ""',
      ]);
    } catch {
      console.warn(
        `Could not read #${n}'s milestone; using the newest release branch.`,
      );
    }
  }

  return activeBase(refs, override, milestone);
}
