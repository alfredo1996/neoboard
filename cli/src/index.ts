#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

export const program = new Command();

program
  .name("neoboard")
  .description("NeoBoard CLI — local development and database management")
  .version(pkg.version);

// Top-level commands

program
  .command("init")
  .description("Initialize a new NeoBoard project")
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runInit } = await import("./commands/init.js");
    await runInit({ mode: opts.mode });
  });

program
  .command("start")
  .description("Start NeoBoard services")
  .action(async () => {
    const { runStart } = await import("./commands/start.js");
    await runStart();
  });

program
  .command("stop")
  .description("Stop NeoBoard services")
  .option("--volumes", "Also remove volumes")
  .action(async (opts) => {
    const { runStop } = await import("./commands/stop.js");
    await runStop({ volumes: opts.volumes });
  });

program
  .command("dev")
  .description("Start NeoBoard in development mode")
  .action(async () => {
    const { runDev } = await import("./commands/dev.js");
    await runDev();
  });

program
  .command("setup")
  .description("Set up local development environment (init + start)")
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runSetup } = await import("./commands/setup.js");
    await runSetup({ mode: opts.mode });
  });

program
  .command("status")
  .description("Show status of NeoBoard services")
  .action(async () => {
    const { runStatus } = await import("./commands/status.js");
    await runStatus();
  });

program
  .command("doctor")
  .description("Check system prerequisites and configuration")
  .action(async () => {
    const { runDoctor, printResults } = await import("./commands/doctor.js");
    const results = await runDoctor();
    const hasFailure = printResults(results);
    if (hasFailure) process.exitCode = 1;
  });

program
  .command("demo")
  .description("Load demo data and dashboards")
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runDemo } = await import("./commands/demo.js");
    await runDemo({ mode: opts.mode });
  });

program
  .command("env")
  .description("Manage environment variables")
  .option("--regenerate", "Force regenerate all secrets")
  .option("--validate", "Check all required vars are set")
  .action(async (opts) => {
    const { runEnv } = await import("./commands/env.js");
    await runEnv({ regenerate: opts.regenerate, validate: opts.validate });
  });

// db subcommand group

const db = program.command("db").description("Database management commands");

db.command("migrate")
  .description("Run database migrations")
  .option("--status", "Show migration status")
  .option("--to <version>", "Target version")
  .option("--dry-run", "Preview without applying")
  .action(async (opts) => {
    const { runDbMigrate } = await import("./commands/db/migrate.js");
    await runDbMigrate({
      status: opts.status,
      to: opts.to,
      dryRun: opts.dryRun,
    });
  });

db.command("reset")
  .description("Reset database to clean state")
  .option("--no-seed", "Skip seeding after reset")
  .option("--force", "Skip confirmation prompt")
  .action(async (opts) => {
    const { runDbReset } = await import("./commands/db/reset.js");
    await runDbReset({ noSeed: !opts.seed, force: opts.force });
  });

db.command("seed")
  .description("Seed database with sample data")
  .option("--neo4j", "Seed Neo4j graph data only")
  .option("--demo", "Seed demo user/dashboards only")
  .action(async (opts) => {
    const { runDbSeed } = await import("./commands/db/seed.js");
    await runDbSeed({ neo4j: opts.neo4j, demo: opts.demo });
  });

db.command("dump")
  .description("Dump database contents")
  .option("--output <path>", "Output file path")
  .option("--data-only", "Dump data only, no schema")
  .action(async (opts) => {
    const { runDbDump } = await import("./commands/db/dump.js");
    await runDbDump({ output: opts.output, dataOnly: opts.dataOnly });
  });

// Only parse when run directly (not when imported in tests)
const isDirectRun =
  process.argv[1]?.endsWith("index.js") ||
  process.argv[1]?.endsWith("neoboard");

if (isDirectRun) {
  program.parse();
}
