#!/usr/bin/env node
/**
 * Scan the current branch with the SonarQube scanner against **SonarCloud**,
 * so the quality-gate verdict you get locally is the real one (#1253).
 *
 * Usage:
 *   npm run sonar:local            # scan the current branch
 *   npm run sonar:local -- --dry-run   # print the command, change nothing
 *   npm run sonar:local -- --force     # allow a protected branch (dangerous)
 *
 * Prerequisites: coverage must already exist — run `npm run verify` first,
 * otherwise Sonar reports 0% and the gate result is meaningless.
 *
 * NOTE: this is deliberately NOT the local SonarQube CE server in
 * docker/docker-compose.yml (--profile sonar). A local CE server has its own
 * gate config and its own new-code baseline, so it cannot predict the verdict
 * that actually blocks a PR.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertScannableBranch,
  resolveSonarToken,
  missingLcovReports,
} from "./lib/sonar-local.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

/** Load SONAR_TOKEN from .env.local without pulling in a dotenv dependency. */
function loadEnvLocal() {
  const file = resolve(ROOT, ".env.local");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
  encoding: "utf8",
}).trim();

assertScannableBranch(branch, { force });

const env = { ...loadEnvLocal(), ...process.env };
const token = resolveSonarToken(env);

// Warn about coverage the scan will silently miss.
const props = readFileSync(resolve(ROOT, "sonar-project.properties"), "utf8");
const missing = missingLcovReports(props, (p) => existsSync(resolve(ROOT, p)));
if (missing.length) {
  console.warn(
    `\n⚠  ${missing.length} declared coverage report(s) are missing:\n` +
      missing.map((m) => `     ${m}`).join("\n") +
      `\n   Coverage will read LOWER than CI. app/coverage-e2e/lcov.info only\n` +
      `   exists after a full Playwright run — treat the coverage number as a\n` +
      `   floor, not a prediction.\n`,
  );
}

const scannerArgs = [
  "--yes",
  "sonarqube-scanner",
  `-Dsonar.host.url=https://sonarcloud.io`,
  `-Dsonar.branch.name=${branch}`,
];

console.log(`\n▸ branch : ${branch}`);
console.log(`▸ target : sonarcloud.io (real gate, not local CE)`);

if (dryRun) {
  console.log(`\n[dry-run] would run:\n  npx ${scannerArgs.join(" ")}\n`);
  process.exit(0);
}

execFileSync("npx", scannerArgs, {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, SONAR_TOKEN: token },
});

console.log(
  `\n✓ Analysis submitted. Gate result:\n` +
    `  https://sonarcloud.io/project/overview?id=alfredo1996_neoboard&branch=${encodeURIComponent(branch)}\n`,
);
