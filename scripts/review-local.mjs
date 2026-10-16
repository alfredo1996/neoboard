#!/usr/bin/env node
/**
 * `npm run review:local` — CodeRabbit review of committed changes against the
 * active base branch instead of a hardcoded one (#1854).
 *
 *   npm run review:local                          # base from the branch's issue
 *   REVIEW_BASE=dev npm run review:local          # explicit base
 *   npm run review:local -- --base-commit <sha>   # extra flags pass through
 */
import { spawnSync } from "node:child_process";
import { resolveBase } from "./lib/active-base.mjs";

// The branch's issue milestone picks the base (#2234).
const base = resolveBase({ override: process.env.REVIEW_BASE });
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
