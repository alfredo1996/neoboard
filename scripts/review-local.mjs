#!/usr/bin/env node
/**
 * `npm run review:local` — CodeRabbit review of committed changes against the
 * active base branch instead of a hardcoded one (#1854).
 *
 *   npm run review:local                          # base picked from origin
 *   REVIEW_BASE=dev npm run review:local          # explicit base
 *   npm run review:local -- --base-commit <sha>   # extra flags pass through
 */
import { execFileSync, spawnSync } from "node:child_process";
import { activeBase } from "./lib/active-base.mjs";

let refs = "";
try {
  refs = execFileSync("git", ["ls-remote", "--heads", "origin", "release/*"], {
    encoding: "utf8",
  });
} catch {
  console.warn(
    "Could not list origin's release branches; falling back to dev.",
  );
}

const base = activeBase(refs, process.env.REVIEW_BASE);
const args = [
  "review",
  "--base",
  base,
  "--committed",
  "-c",
  ".claude/CLAUDE.md",
  "-c",
  ".coderabbit.yaml",
  ...process.argv.slice(2),
];

console.log(`coderabbit ${args.join(" ")}`);
const result = spawnSync("coderabbit", args, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
