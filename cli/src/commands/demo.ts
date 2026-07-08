import { join } from "node:path";
import { run } from "../lib/exec.js";
import { paths, readProjectConfig } from "../lib/config.js";
import { buildSeedEnv } from "../lib/docker-env.js";
import {
  success,
  banner,
  info,
  error as logError,
  createSpinner,
} from "../lib/output.js";
import { confirm } from "../lib/prompt.js";
import { loadShowcases } from "../lib/showcases.js";
import { runSetup } from "./setup.js";
import { runDbSeed } from "./db/seed.js";

/**
 * Full demo bootstrap: setup + seed Neo4j + seed demo dashboards.
 * Unchanged from before — `neoboard demo` still does the one-shot flow.
 */
export async function runDemo(opts?: {
  mode?: "docker" | "local";
}): Promise<void> {
  const ok = await runSetup({ ...opts, full: true });
  if (!ok) {
    // Setup already printed the failure + remediation hints. Seeding (or
    // advertising login credentials) against a stack that never came up
    // would be a lie — bail with a non-zero exit instead.
    process.exitCode = 1;
    return;
  }
  await runDbSeed({ neo4j: true, demo: true });

  banner([
    "Demo environment ready!",
    "",
    "Login credentials:",
    "  admin:    admin@neoboard.local / admin123",
    "  creator:  creator@neoboard.local / creator123",
    "  reader:   reader@neoboard.local / reader123 (read-only)",
  ]);
  const appPort = readProjectConfig().ports.app;
  success(`Open http://localhost:${appPort} to get started`);
}

/**
 * Reseed the 4 demo showcases without restarting Docker or reseeding Neo4j.
 * Invokes `scripts/seed-demo.mjs` with an optional `--only=<keys>` filter.
 */
export async function runDemoSeed(opts?: { only?: string }): Promise<void> {
  const manifest = await loadShowcases();

  let onlyKeys: string[] | undefined;
  try {
    onlyKeys = manifest.parseOnlyFlag(opts?.only);
  } catch (err) {
    logError((err as Error).message);
    process.exitCode = 1;
    return;
  }

  const targets = onlyKeys
    ? manifest.SHOWCASES.filter((s) => onlyKeys.includes(s.key))
    : manifest.SHOWCASES;

  info(
    `Seeding ${targets.length} showcase${targets.length === 1 ? "" : "s"}: ${targets
      .map((s) => s.key)
      .join(", ")}`,
  );

  const scriptPath = join(paths.root, "scripts", "seed-demo.mjs");
  const onlyArg = onlyKeys ? ` --only=${onlyKeys.join(",")}` : "";
  const spinner = createSpinner("Running seed-demo.mjs...");
  spinner.start();
  try {
    run(`node "${scriptPath}"${onlyArg}`, {
      cwd: paths.root,
      env: buildSeedEnv(readProjectConfig()),
    });
    spinner.succeed("Showcases seeded");
  } catch (err) {
    spinner.fail("Seed failed");
    process.exitCode = 1;
    throw err;
  }
}

/**
 * Prints the list of registered showcases with their keys and JSON paths.
 */
export async function runDemoList(): Promise<void> {
  const manifest = await loadShowcases();
  info("Available showcases:");
  for (const s of manifest.SHOWCASES) {
    console.log(`  ${s.key.padEnd(20)} ${s.label}`);
    console.log(`  ${" ".repeat(20)} ${s.description}`);
  }
  console.log("");
  info("Seed one:     neoboard demo seed --only=" + manifest.SHOWCASES[0].key);
  info("Seed all:     neoboard demo seed");
  info("Reset all:    neoboard demo reset --force");
}

/**
 * Removes showcase dashboards from the config DB and drops the
 * isolated `neoboard_demo_*` Postgres schema.
 *
 * Implementation lives in `scripts/seed-demo.mjs --reset`. This wrapper
 * just asks for confirmation, enforces `--force` bypass, and delegates.
 */
export async function runDemoReset(opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force) {
    const confirmed = await confirm(
      "This will delete all demo showcase dashboards and drop the neoboard_demo_* Postgres schema. Continue?",
    );
    if (!confirmed) {
      info("Aborted.");
      return;
    }
  }

  const scriptPath = join(paths.root, "scripts", "seed-demo.mjs");
  const spinner = createSpinner("Resetting demo state...");
  spinner.start();
  try {
    run(`node "${scriptPath}" --reset`, {
      cwd: paths.root,
      env: buildSeedEnv(readProjectConfig()),
    });
    spinner.succeed("Demo state reset");
  } catch (err) {
    spinner.fail("Reset failed");
    process.exitCode = 1;
    throw err;
  }
}
