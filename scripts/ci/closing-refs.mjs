#!/usr/bin/env node
/**
 * Which issues does a merged PR body close? (#1853)
 *
 * GitHub acts on `Closes #N` only for PRs merged into the default branch, so
 * .github/workflows/close-issues-on-merge.yml does it for release/* and main.
 * This matches the keywords GitHub recognises: close/closes/closed,
 * fix/fixes/fixed, resolve/resolves/resolved, any case, an optional colon,
 * then `#N` or `owner/repo#N` naming this repository. One reference per
 * keyword, as on GitHub: in "Closes #1, #2" only #1 closes.
 *
 * CLI: reads BODY and REPO from the environment and prints the issue numbers
 * space-separated. The body never passes through a shell.
 */
import { pathToFileURL } from "node:url";

const PATTERN =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?::\s*|\s+)(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi;

/**
 * @param {string | null | undefined} body the merged PR's description
 * @param {string} repo `owner/name` of this repository
 * @returns {number[]} issue numbers, sorted and unique
 */
export function closingRefs(body, repo) {
  if (!body) return [];
  const numbers = new Set();
  for (const [, ref, number] of body.matchAll(PATTERN)) {
    if (ref && ref.toLowerCase() !== repo.toLowerCase()) continue;
    numbers.add(Number(number));
  }
  return [...numbers].sort((a, b) => a - b);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  console.log(closingRefs(process.env.BODY, process.env.REPO ?? "").join(" "));
}
