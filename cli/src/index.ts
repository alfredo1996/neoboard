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
  .description(
    "NeoBoard CLI — install, run, and manage NeoBoard\n\n" +
      "Quick start:\n" +
      "  neoboard setup          # Docker: init + start + migrate\n" +
      "  neoboard demo           # Docker: setup + load demo data\n" +
      "  neoboard setup --mode local  # Use your own PostgreSQL + Neo4j\n\n" +
      "Development:\n" +
      "  neoboard dev            # Start dev server (auto-starts DBs)\n" +
      "  neoboard status         # Check service health",
  )
  .version(pkg.version);

// Top-level commands

program
  .command("init")
  .description(
    "Initialize project config and install dependencies\n" +
      "  --mode docker  Use Docker for everything (default)\n" +
      "  --mode local   Use local Node.js + your own databases",
  )
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runInit } = await import("./commands/init.js");
    await runInit({ mode: opts.mode });
  });

program
  .command("start")
  .description(
    "Start NeoBoard services, run migrations\n" +
      "  Docker mode: starts containers via docker compose\n" +
      "  Local mode: connects to your running PostgreSQL + Neo4j",
  )
  .action(async () => {
    const { runStart } = await import("./commands/start.js");
    await runStart();
  });

program
  .command("stop")
  .description("Stop NeoBoard Docker containers")
  .option("--volumes", "Also remove data volumes (clean slate)")
  .action(async (opts) => {
    const { runStop } = await import("./commands/stop.js");
    await runStop({ volumes: opts.volumes });
  });

program
  .command("dev")
  .description(
    "Start Next.js dev server with hot reload (local mode only)\n" +
      "  Auto-starts database containers if not running",
  )
  .action(async () => {
    const { runDev } = await import("./commands/dev.js");
    await runDev();
  });

program
  .command("setup")
  .description(
    "Full setup: init + start + migrate (one command to get running)\n" +
      "  --mode docker  Docker for everything (default)\n" +
      "  --mode local   Install deps, generate .env, connect to your DBs",
  )
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runSetup } = await import("./commands/setup.js");
    await runSetup({ mode: opts.mode });
  });

program
  .command("status")
  .description("Show health of PostgreSQL, Neo4j, and the app")
  .action(async () => {
    const { runStatus } = await import("./commands/status.js");
    await runStatus();
  });

program
  .command("doctor")
  .description(
    "Check prerequisites (Docker, Node.js, ports, env file)\n" +
      "  Helpful for debugging setup issues",
  )
  .action(async () => {
    const { runDoctor, printResults } = await import("./commands/doctor.js");
    const results = await runDoctor();
    const hasFailure = printResults(results);
    if (hasFailure) process.exitCode = 1;
  });

program
  .command("demo")
  .description(
    "Set up a demo environment with sample data and dashboards\n" +
      "  Runs setup + seeds Neo4j graph data + creates demo user",
  )
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runDemo } = await import("./commands/demo.js");
    await runDemo({ mode: opts.mode });
  });

const env = program
  .command("env")
  .description("Manage app environment variables (app/.env.local)");

env
  .command("generate")
  .description("Generate app/.env.local with fresh secrets")
  .option("--regenerate", "Overwrite existing file")
  .action(async (opts) => {
    const { runEnv } = await import("./commands/env.js");
    await runEnv({ regenerate: opts.regenerate });
  });

env
  .command("validate")
  .description("Check that all required vars are set")
  .action(async () => {
    const { runEnv } = await import("./commands/env.js");
    await runEnv({ validate: true });
  });

env
  .command("list")
  .description("Show all known env vars with set/unset status")
  .action(async () => {
    const { runEnvList } = await import("./commands/env.js");
    await runEnvList();
  });

env
  .command("get <key>")
  .description("Get an env var value from app/.env.local")
  .action(async (key) => {
    const { runEnvGet } = await import("./commands/env.js");
    await runEnvGet(key);
  });

env
  .command("set <key> <value>")
  .description("Set an env var in app/.env.local")
  .action(async (key, value) => {
    const { runEnvSet } = await import("./commands/env.js");
    await runEnvSet(key, value);
  });

// config subcommand group

const config = program
  .command("config")
  .description("View or modify project configuration");

config
  .command("list")
  .description("Show all config values")
  .action(async () => {
    const { runConfigList } = await import("./commands/config.js");
    runConfigList();
  });

config
  .command("get <key>")
  .description("Get a config value (e.g. ports.app, postgres.user)")
  .action(async (key) => {
    const { runConfigGet } = await import("./commands/config.js");
    runConfigGet(key);
  });

config
  .command("set <key> <value>")
  .description("Set a config value (e.g. neoboard config set ports.app 4000)")
  .action(async (key, value) => {
    const { runConfigSet } = await import("./commands/config.js");
    runConfigSet(key, value);
  });

// logs command

program
  .command("logs [service]")
  .description("Tail Docker container logs (services: postgres, neo4j, app)")
  .option("-f, --follow", "Follow log output", false)
  .option("-n, --lines <n>", "Number of lines to show", "50")
  .action(async (service, opts) => {
    const { runLogs } = await import("./commands/logs.js");
    await runLogs({ service, follow: opts.follow, lines: opts.lines });
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
