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

const demo = program
  .command("demo")
  .description(
    "Set up a demo environment with sample data and dashboards\n" +
      "  Runs setup + seeds Neo4j graph data + creates demo user\n" +
      "  Subcommands: seed, list, reset",
  )
  .option("--mode <mode>", "Set mode: docker or local", "docker")
  .action(async (opts) => {
    const { runDemo } = await import("./commands/demo.js");
    await runDemo({ mode: opts.mode });
  });

demo
  .command("seed")
  .description(
    "Reseed the 4 demo showcases without restarting Docker or reseeding Neo4j\n" +
      "  --only <keys>  Comma-separated showcase keys (e.g. chart-gallery,click-actions)",
  )
  .option("--only <keys>", "Comma-separated showcase keys to seed")
  .action(async (opts) => {
    const { runDemoSeed } = await import("./commands/demo.js");
    await runDemoSeed({ only: opts.only });
  });

demo
  .command("list")
  .description("Print the available demo showcases and their JSON paths")
  .action(async () => {
    const { runDemoList } = await import("./commands/demo.js");
    await runDemoList();
  });

demo
  .command("reset")
  .description(
    "Remove showcase dashboards and drop the neoboard_demo_* Postgres schema\n" +
      "  --force  Skip confirmation prompt",
  )
  .option("--force", "Skip confirmation prompt")
  .action(async (opts) => {
    const { runDemoReset } = await import("./commands/demo.js");
    await runDemoReset({ force: opts.force });
  });

program
  .command("env")
  .description(
    "Generate or validate app/.env.local\n" +
      "  --validate     Check that all required vars are set\n" +
      "  --regenerate   Overwrite with fresh secrets",
  )
  .option("--regenerate", "Force regenerate all secrets")
  .option("--validate", "Check all required vars are set")
  .action(async (opts) => {
    const { runEnv } = await import("./commands/env.js");
    await runEnv({ regenerate: opts.regenerate, validate: opts.validate });
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

// plugin subcommand group

const plugin = program
  .command("plugin")
  .description("Manage external chart and connector plugins");

plugin
  .command("add <package>")
  .description(
    "Install and register an external plugin\n" +
      "  Auto-detects chart vs connector from the package export",
  )
  .option("--override", "Allow replacing a built-in plugin")
  .option("--export <name>", "Named export to use (default: default)")
  .action(async (packageName, opts) => {
    const { runPluginAdd } = await import("./commands/plugin.js");
    await runPluginAdd(packageName, {
      override: opts.override,
      export: opts.export,
    });
  });

plugin
  .command("list")
  .description("Show all registered plugins (built-in + external)")
  .action(async () => {
    const { runPluginList } = await import("./commands/plugin.js");
    runPluginList();
  });

plugin
  .command("remove <package>")
  .description("Unregister and uninstall an external plugin")
  .action(async (packageName) => {
    const { runPluginRemove } = await import("./commands/plugin.js");
    await runPluginRemove(packageName);
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
