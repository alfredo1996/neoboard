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

const program = new Command();

program
  .name("neoboard")
  .description("NeoBoard CLI — local development and database management")
  .version(pkg.version);

// Top-level stub commands

program
  .command("init")
  .description("Initialize a new NeoBoard project")
  .action(() => {
    console.log("Not yet implemented — see issue #305");
  });

program
  .command("start")
  .description("Start NeoBoard services")
  .action(() => {
    console.log("Not yet implemented — see issue #305");
  });

program
  .command("stop")
  .description("Stop NeoBoard services")
  .action(() => {
    console.log("Not yet implemented — see issue #305");
  });

program
  .command("dev")
  .description("Start NeoBoard in development mode")
  .action(() => {
    console.log("Not yet implemented — see issue #307");
  });

program
  .command("setup")
  .description("Set up local development environment")
  .action(() => {
    console.log("Not yet implemented — see issue #305");
  });

program
  .command("status")
  .description("Show status of NeoBoard services")
  .action(() => {
    console.log("Not yet implemented — see issue #308");
  });

program
  .command("doctor")
  .description("Check system prerequisites and configuration")
  .action(() => {
    console.log("Not yet implemented — see issue #303");
  });

program
  .command("demo")
  .description("Load demo data and dashboards")
  .action(() => {
    console.log("Not yet implemented — see issue #309");
  });

program
  .command("env")
  .description("Manage environment variables")
  .action(() => {
    console.log("Not yet implemented — see issue #304");
  });

// db subcommand group

const db = program.command("db").description("Database management commands");

db.command("migrate")
  .description("Run database migrations")
  .action(() => {
    console.log("Not yet implemented — see issue #306");
  });

db.command("reset")
  .description("Reset database to clean state")
  .action(() => {
    console.log("Not yet implemented — see issue #310");
  });

db.command("seed")
  .description("Seed database with sample data")
  .action(() => {
    console.log("Not yet implemented — see issue #309");
  });

db.command("dump")
  .description("Dump database contents")
  .action(() => {
    console.log("Not yet implemented — see issue #311");
  });

program.parse();
