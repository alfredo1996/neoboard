import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Command } from "commander";

/**
 * Every command's option-to-argument wiring (#1629).
 *
 * `cli/src/index.ts` sat at 0% function coverage: all 24 `.action(async …)`
 * handlers were dead to the suite. Each one is pure plumbing — it reads
 * commander's `opts` and calls one `run*` function — and plumbing is exactly
 * where a transposition hides. `program.test.ts` inspects the command TREE and
 * never invokes a handler, so nothing noticed.
 *
 * What that risks, concretely: `db restore` forwards
 * `{ clean: opts.clean, force: opts.force }`. Swap those two and `--force`
 * silently drops every object in the target database while `--clean` bypasses
 * the confirmation prompt and the running-app preflight.
 *
 * These drive the REAL commander program with the command modules mocked, so
 * they assert the wiring itself rather than a re-implementation of it.
 */

const runInit = vi.fn();
const runStart = vi.fn();
const runStop = vi.fn();
const runDev = vi.fn();
const runSetup = vi.fn();
const runStatus = vi.fn();
const runDoctor = vi.fn();
const printResults = vi.fn(() => false);
const runDemo = vi.fn();
const runDemoSeed = vi.fn();
const runDemoList = vi.fn();
const runDemoReset = vi.fn();
const runEnv = vi.fn();
const runConfigList = vi.fn();
const runConfigGet = vi.fn();
const runConfigSet = vi.fn();
const runPluginAdd = vi.fn();
const runPluginList = vi.fn();
const runPluginRemove = vi.fn();
const runLogs = vi.fn();
const runDbMigrate = vi.fn();
const runDbReset = vi.fn();
const runDbSeed = vi.fn();
const runDbDump = vi.fn();
const runDbRestore = vi.fn();

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({ version: "0.0.1" })),
}));

vi.mock("../commands/init.js", () => ({ runInit }));
vi.mock("../commands/start.js", () => ({ runStart }));
vi.mock("../commands/stop.js", () => ({ runStop }));
vi.mock("../commands/dev.js", () => ({ runDev }));
vi.mock("../commands/setup.js", () => ({ runSetup }));
vi.mock("../commands/status.js", () => ({ runStatus }));
vi.mock("../commands/doctor.js", () => ({ runDoctor, printResults }));
vi.mock("../commands/demo.js", () => ({
  runDemo,
  runDemoSeed,
  runDemoList,
  runDemoReset,
}));
vi.mock("../commands/env.js", () => ({ runEnv }));
vi.mock("../commands/config.js", () => ({
  runConfigList,
  runConfigGet,
  runConfigSet,
}));
vi.mock("../commands/plugin.js", () => ({
  runPluginAdd,
  runPluginList,
  runPluginRemove,
}));
vi.mock("../commands/logs.js", () => ({ runLogs }));
vi.mock("../commands/db/migrate.js", () => ({ runDbMigrate }));
vi.mock("../commands/db/reset.js", () => ({ runDbReset }));
vi.mock("../commands/db/seed.js", () => ({ runDbSeed }));
vi.mock("../commands/db/dump.js", () => ({ runDbDump }));
vi.mock("../commands/db/restore.js", () => ({ runDbRestore }));

let program: Command;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  program = (await import("../index.js")).program;
});

/** Drive the real program exactly as the shell would. */
const run = (...argv: string[]) =>
  program.parseAsync(["node", "neoboard", ...argv]);

describe("db restore — the destructive pair", () => {
  it("forwards --clean as clean, not as force", async () => {
    await run("db", "restore", "dump.sql", "--clean");
    expect(runDbRestore).toHaveBeenCalledWith("dump.sql", {
      clean: true,
      force: undefined,
    });
  });

  it("forwards --force as force, not as clean", async () => {
    // Transposed, this would drop every object in the target database while
    // the user believed they were only skipping a prompt.
    await run("db", "restore", "dump.sql", "--force");
    expect(runDbRestore).toHaveBeenCalledWith("dump.sql", {
      clean: undefined,
      force: true,
    });
  });

  it("passes the dump path through as the first argument", async () => {
    await run("db", "restore", "/tmp/backup.dump");
    expect(runDbRestore).toHaveBeenCalledWith("/tmp/backup.dump", {
      clean: undefined,
      force: undefined,
    });
  });
});

describe("db reset — --no-seed inverts twice", () => {
  it("seeds by default", async () => {
    // Commander's `--no-seed` makes opts.seed default to TRUE, and the handler
    // negates it: `{ noSeed: !opts.seed }`. Two inversions that cancel — drop
    // either one and a reset either skips the seed it was asked for or reseeds
    // a database the user asked to leave empty.
    await run("db", "reset", "--force");
    expect(runDbReset).toHaveBeenCalledWith({ noSeed: false, force: true });
  });

  it("skips the seed when --no-seed is given", async () => {
    await run("db", "reset", "--no-seed");
    expect(runDbReset).toHaveBeenCalledWith({
      noSeed: true,
      force: undefined,
    });
  });
});

describe("setup — full is derived, not passed", () => {
  it("derives full=false from --mode local", async () => {
    await run("setup", "--mode", "local");
    expect(runSetup).toHaveBeenCalledWith({ mode: "local", full: false });
  });

  it("derives full=true from any other mode", async () => {
    await run("setup", "--mode", "docker");
    expect(runSetup).toHaveBeenCalledWith({ mode: "docker", full: true });
  });
});

describe("every other command forwards its options", () => {
  it("init --mode", async () => {
    await run("init", "--mode", "docker");
    expect(runInit).toHaveBeenCalledWith({ mode: "docker" });
  });

  it("start --full --expose-host", async () => {
    await run("start", "--full", "--expose-host");
    expect(runStart).toHaveBeenCalledWith({ full: true, exposeHost: true });
  });

  it("stop --volumes", async () => {
    await run("stop", "--volumes");
    expect(runStop).toHaveBeenCalledWith({ volumes: true });
  });

  it("dev takes no options", async () => {
    await run("dev");
    expect(runDev).toHaveBeenCalled();
  });

  it("demo --mode", async () => {
    await run("demo", "--mode", "docker");
    expect(runDemo).toHaveBeenCalledWith({ mode: "docker" });
  });

  it("demo seed --only", async () => {
    await run("demo", "seed", "--only", "movies");
    expect(runDemoSeed).toHaveBeenCalledWith({ only: "movies" });
  });

  it("demo reset --force", async () => {
    await run("demo", "reset", "--force");
    expect(runDemoReset).toHaveBeenCalledWith({ force: true });
  });

  it("env --regenerate --validate", async () => {
    await run("env", "--regenerate", "--validate");
    expect(runEnv).toHaveBeenCalledWith({ regenerate: true, validate: true });
  });

  it("config set passes key and value in order", async () => {
    await run("config", "set", "ports.app", "4000");
    expect(runConfigSet).toHaveBeenCalledWith("ports.app", "4000");
  });

  it("config get passes the key", async () => {
    await run("config", "get", "ports.app");
    expect(runConfigGet).toHaveBeenCalledWith("ports.app");
  });

  it("plugin remove passes the package name", async () => {
    await run("plugin", "remove", "@acme/widget");
    expect(runPluginRemove).toHaveBeenCalledWith("@acme/widget");
  });

  it("logs passes the service and its options", async () => {
    await run("logs", "neo4j", "--follow", "--lines", "50");
    expect(runLogs).toHaveBeenCalledWith({
      service: "neo4j",
      follow: true,
      lines: "50",
    });
  });

  it("db migrate --status --to --dry-run", async () => {
    await run("db", "migrate", "--status", "--to", "0007", "--dry-run");
    expect(runDbMigrate).toHaveBeenCalledWith({
      status: true,
      to: "0007",
      dryRun: true,
    });
  });

  it("db seed --neo4j --demo", async () => {
    await run("db", "seed", "--neo4j", "--demo");
    expect(runDbSeed).toHaveBeenCalledWith({ neo4j: true, demo: true });
  });

  it("plugin add passes the package name and its options", async () => {
    await run("plugin", "add", "@acme/chart", "--override", "--export", "Widget");
    expect(runPluginAdd).toHaveBeenCalledWith("@acme/chart", {
      override: true,
      export: "Widget",
    });
  });

  it.each([
    ["status", runStatus],
    ["doctor", runDoctor],
  ])("%s takes no options and is still invoked", async (cmd, fn) => {
    await run(cmd);
    expect(fn).toHaveBeenCalled();
  });

  it.each([
    [["demo", "list"], runDemoList],
    [["config", "list"], runConfigList],
    [["plugin", "list"], runPluginList],
  ])("%s is wired to its command", async (argv, fn) => {
    await run(...argv);
    expect(fn).toHaveBeenCalled();
  });

  it("doctor sets a failing exit code when a check fails", async () => {
    // The only handler that does anything beyond forwarding: it reads
    // printResults' verdict and turns it into process.exitCode. A CI job that
    // runs `neoboard doctor` depends on that.
    printResults.mockReturnValueOnce(true);
    await run("doctor");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("db dump --output --data-only", async () => {
    await run("db", "dump", "--output", "out.sql", "--data-only");
    expect(runDbDump).toHaveBeenCalledWith({
      output: "out.sql",
      dataOnly: true,
    });
  });
});
