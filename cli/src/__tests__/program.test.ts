import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// We test the program structure without executing real commands.
// Import the program export to inspect its configuration.

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: "0.0.1" })),
}));

// Prevent actual command execution
vi.mock("../commands/doctor.js", () => ({
  runDoctor: vi.fn(async () => []),
  printResults: vi.fn(() => false),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CLI program", () => {
  let program: Command;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../index.js");
    program = mod.program;
  });

  it("has correct name", () => {
    expect(program.name()).toBe("neoboard");
  });

  it("has a version set", () => {
    expect(program.version()).toBe("0.0.1");
  });

  it("registers top-level commands", () => {
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("init");
    expect(commandNames).toContain("start");
    expect(commandNames).toContain("stop");
    expect(commandNames).toContain("dev");
    expect(commandNames).toContain("setup");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("doctor");
    expect(commandNames).toContain("demo");
    expect(commandNames).toContain("env");
    expect(commandNames).toContain("db");
  });

  it("registers db subcommands", () => {
    const dbCmd = program.commands.find((c) => c.name() === "db");
    expect(dbCmd).toBeDefined();
    const subNames = dbCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("migrate");
    expect(subNames).toContain("reset");
    expect(subNames).toContain("seed");
    expect(subNames).toContain("dump");
    expect(subNames).toContain("restore");
  });

  it("db restore takes a required backup file and has --clean/--force", () => {
    const dbCmd = program.commands.find((c) => c.name() === "db");
    const restoreCmd = dbCmd!.commands.find((c) => c.name() === "restore");
    const args = restoreCmd!.registeredArguments;
    expect(args.map((a) => a.name())).toEqual(["file"]);
    expect(args[0].required).toBe(true);
    const opts = restoreCmd!.options.map((o) => o.long);
    expect(opts).toContain("--clean");
    expect(opts).toContain("--force");
  });

  it("init has --mode option", () => {
    const initCmd = program.commands.find((c) => c.name() === "init");
    const opts = initCmd!.options.map((o) => o.long);
    expect(opts).toContain("--mode");
  });

  it("env has --regenerate and --validate options", () => {
    const envCmd = program.commands.find((c) => c.name() === "env");
    const opts = envCmd!.options.map((o) => o.long);
    expect(opts).toContain("--regenerate");
    expect(opts).toContain("--validate");
  });

  it("db migrate has --status, --to, --dry-run options", () => {
    const dbCmd = program.commands.find((c) => c.name() === "db");
    const migrateCmd = dbCmd!.commands.find((c) => c.name() === "migrate");
    const opts = migrateCmd!.options.map((o) => o.long);
    expect(opts).toContain("--status");
    expect(opts).toContain("--to");
    expect(opts).toContain("--dry-run");
  });

  it("db dump has --output and --data-only options", () => {
    const dbCmd = program.commands.find((c) => c.name() === "db");
    const dumpCmd = dbCmd!.commands.find((c) => c.name() === "dump");
    const opts = dumpCmd!.options.map((o) => o.long);
    expect(opts).toContain("--output");
    expect(opts).toContain("--data-only");
  });

  it("db reset has --no-seed and --force options", () => {
    const dbCmd = program.commands.find((c) => c.name() === "db");
    const resetCmd = dbCmd!.commands.find((c) => c.name() === "reset");
    const opts = resetCmd!.options.map((o) => o.long);
    expect(opts).toContain("--no-seed");
    expect(opts).toContain("--force");
  });

  it("stop has --volumes option", () => {
    const stopCmd = program.commands.find((c) => c.name() === "stop");
    const opts = stopCmd!.options.map((o) => o.long);
    expect(opts).toContain("--volumes");
  });
});
