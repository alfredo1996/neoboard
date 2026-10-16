#!/usr/bin/env node
/**
 * `npm run -s base -- [issue]` — prints the branch an issue's work starts from
 * and PRs into, picked by its milestone (#2234). With no issue, the one in the
 * current branch name (`fix/issue-<N>-…`).
 */
import { resolveBase } from "./lib/active-base.mjs";

console.log(resolveBase({ issue: process.argv[2] }));
