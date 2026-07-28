import { describe, it, expect, vi, beforeEach } from "vitest";

// The dump file is streamed to the restore tool's STDIN via a file descriptor
// (never buffered into JS), mirroring `db dump`. Mock child_process + fs.
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0, stderr: Buffer.from("") })),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  openSync: vi.fn(() => 3),
  readSync: vi.fn(() => 5),
  closeSync: vi.fn(),
  statSync: vi.fn(() => ({
    size: 2048,
    mtime: new Date("2026-07-20T09:30:00Z"),
  })),
  readFileSync: vi.fn(() => ""),
}));

vi.mock("../../../lib/config.js", () => ({
  paths: { root: "/project", envFile: "/project/app/.env.local" },
  readProjectConfig: vi.fn(() => ({
    ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
    postgres: { user: "neoboard", password: "neoboard", database: "neoboard" },
    neo4j: { user: "neo4j", password: "password" },
    seed: { script: "scripts/seed.mjs", neo4j_cypher: "" },
  })),
  getMode: vi.fn(() => "docker"),
}));

vi.mock("../../../lib/exec.js", () => ({ runFile: vi.fn(() => "") }));

vi.mock("../../../lib/output.js", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock("../../../lib/prompt.js", () => ({ confirm: vi.fn(async () => true) }));

vi.mock("../../../lib/docker.js", () => ({ isAppReady: vi.fn(() => false) }));

// Never read the real docker/.env — it is generated and gitignored, so a test
// that depended on it would pass locally and skip silently in CI.
vi.mock("../../../lib/docker-env.js", () => ({
  readDockerEnvSecrets: vi.fn(() => ({ ENCRYPTION_KEY: "a".repeat(64) })),
}));

vi.mock("../../../lib/credential-probe.js", () => ({
  probeCredentialDecryption: vi.fn(async () => ({ outcome: "ok" })),
}));

import { spawnSync } from "node:child_process";
import { existsSync, readSync, closeSync } from "node:fs";
import { getMode, readProjectConfig } from "../../../lib/config.js";
import { runFile } from "../../../lib/exec.js";
import { info, success, error as logError } from "../../../lib/output.js";
import { confirm } from "../../../lib/prompt.js";
import { isAppReady } from "../../../lib/docker.js";
import { probeCredentialDecryption } from "../../../lib/credential-probe.js";
import { runDbRestore } from "../../../commands/db/restore.js";

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadSync = vi.mocked(readSync);
const mockGetMode = vi.mocked(getMode);
const mockReadProjectConfig = vi.mocked(readProjectConfig);
const mockRunFile = vi.mocked(runFile);
const mockConfirm = vi.mocked(confirm);
const mockIsAppReady = vi.mocked(isAppReady);
const mockProbe = vi.mocked(probeCredentialDecryption);

/** Tables reported by the pre-flight `pg_tables` query. */
let tablesInTarget: string[] = [];
/** Rows reported by the post-restore count query, as `name|count`. */
let rowCounts = "";

/** The SQL text is always the last argv element (`-tAc <sql>`). */
function sqlOf(args: readonly string[]): string {
  return args[args.length - 1];
}

/** Every psql/pg_restore invocation, as one flat string per call. */
function spawnArgs(): string[] {
  return mockSpawnSync.mock.calls.map((c) =>
    [c[0], ...(c[1] as string[])].join(" "),
  );
}

function queriesRun(): string[] {
  return mockRunFile.mock.calls.map((c) => sqlOf(c[1] as string[]));
}

/** Make the dump file look like a `pg_dump -Fc` archive (magic "PGDMP"). */
function makeCustomFormat(): void {
  mockReadSync.mockImplementation((_fd, buffer) => {
    (buffer as Buffer).write("PGDMP");
    return 5;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tablesInTarget = [];
  rowCounts = "";
  mockGetMode.mockReturnValue("docker");
  mockExistsSync.mockReturnValue(true);
  mockIsAppReady.mockReturnValue(false);
  mockConfirm.mockResolvedValue(true);
  mockProbe.mockResolvedValue({ outcome: "ok" });
  // Plain SQL by default — that is what `neoboard db dump` writes.
  mockReadSync.mockImplementation((_fd, buffer) => {
    (buffer as Buffer).write("--\n-- ");
    return 5;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSpawnSync.mockReturnValue({ status: 0, stderr: Buffer.from("") } as any);
  mockRunFile.mockImplementation((_bin, args) => {
    const sql = sqlOf(args);
    if (sql.includes("pg_tables")) return tablesInTarget.join("\n");
    if (sql.includes("count(*)")) return rowCounts;
    return "";
  });
  process.exitCode = 0;
});

describe("runDbRestore — refusing to destroy data", () => {
  it("refuses a non-empty target without --clean, naming the tables found", async () => {
    tablesInTarget = ["connection", "dashboard", "users"];

    await runDbRestore("/backups/b.sql", {});

    const message = vi.mocked(logError).mock.calls[0][0];
    expect(message).toContain("dashboard");
    expect(message).toContain("connection");
    expect(message).toContain("--clean");
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("restores into a non-empty target once --clean is passed", async () => {
    tablesInTarget = ["connection", "dashboard"];

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("restores an empty target without --clean", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });

  it("refuses when the database cannot be reached", async () => {
    mockRunFile.mockImplementation(() => {
      throw new Error("psql: could not connect to server");
    });

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain("Cannot reach");
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("fails when the backup file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    await runDbRestore("/backups/missing.sql", { force: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain(
      "/backups/missing.sql",
    );
    expect(mockRunFile).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rejects an unsafe postgres.database before running any SQL", async () => {
    mockReadProjectConfig.mockReturnValueOnce({
      ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
      postgres: {
        user: "neoboard",
        password: "neoboard",
        database: "neo;board",
      },
      neo4j: { user: "neo4j", password: "password" },
      seed: { script: "scripts/seed.mjs", neo4j_cypher: "" },
    });

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain(
      "Invalid PostgreSQL identifier",
    );
    expect(mockRunFile).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("rejects an unsafe postgres.user before running any SQL", async () => {
    mockReadProjectConfig.mockReturnValueOnce({
      ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
      postgres: {
        user: "bad;user",
        password: "neoboard",
        database: "neoboard",
      },
      neo4j: { user: "neo4j", password: "password" },
      seed: { script: "scripts/seed.mjs", neo4j_cypher: "" },
    });

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain(
      "Invalid PostgreSQL identifier",
    );
    expect(mockRunFile).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("runDbRestore — the app must not be migrating underneath it", () => {
  it("refuses while NeoBoard is running, naming MIGRATE_ON_START", async () => {
    mockIsAppReady.mockReturnValue(true);

    await runDbRestore("/backups/b.sql", { clean: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain("MIGRATE_ON_START");
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("proceeds anyway with --force", async () => {
    mockIsAppReady.mockReturnValue(true);

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(0);
  });
});

describe("runDbRestore — confirmation", () => {
  it("aborts without restoring when the operator declines", async () => {
    mockConfirm.mockResolvedValue(false);

    await runDbRestore("/backups/b.sql", { clean: true });

    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("Aborted.");
    // Declining is not a failure — a non-zero exit would make wrapper
    // scripts treat a deliberate abort as a broken restore.
    expect(process.exitCode).toBe(0);
  });

  it("names the target database in the confirmation prompt", async () => {
    await runDbRestore("/backups/b.sql", { clean: true });

    expect(mockConfirm.mock.calls[0][0]).toContain("neoboard");
  });

  it("skips the prompt with --force", async () => {
    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });
});

describe("runDbRestore — invocation", () => {
  it("pipes the dump into psql via `docker exec -i` in docker mode", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    const [bin, args, options] = mockSpawnSync.mock.calls[0];
    expect(bin).toBe("docker");
    // Without -i the container gets no stdin and restores an empty database.
    expect(args).toEqual([
      "exec",
      "-i",
      "neoboard-postgres",
      "psql",
      "-U",
      "neoboard",
      "-d",
      "neoboard",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    // stdout ignored, not piped: spawnSync caps pipes at 1 MiB, and psql's
    // per-statement tags on a real database would blow past it (ENOBUFS).
    expect(options).toMatchObject({ stdio: [3, "ignore", "pipe"] });
  });

  it("runs local psql against the configured port in local mode", async () => {
    mockGetMode.mockReturnValue("local");

    await runDbRestore("/backups/b.sql", { force: true });

    const [bin, args] = mockSpawnSync.mock.calls[0];
    expect(bin).toBe("psql");
    expect(args).toEqual([
      "-h",
      "localhost",
      "-p",
      "5432",
      "-U",
      "neoboard",
      "-d",
      "neoboard",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
  });

  it("closes the dump file descriptor even when the restore fails", async () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stderr: Buffer.from('psql: FATAL: role "neoboard" does not exist'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await runDbRestore("/backups/b.sql", { force: true });

    expect(closeSync).toHaveBeenCalledWith(3);
  });
});

describe("runDbRestore — custom-format archives", () => {
  it("uses pg_restore with --clean --if-exists for a PGDMP archive", async () => {
    makeCustomFormat();
    tablesInTarget = ["connection"];

    await runDbRestore("/backups/b.dump", { clean: true, force: true });

    const args = mockSpawnSync.mock.calls[0][1] as string[];
    expect(args).toEqual([
      "exec",
      "-i",
      "neoboard-postgres",
      "pg_restore",
      "-U",
      "neoboard",
      "-d",
      "neoboard",
      "--clean",
      "--if-exists",
    ]);
    // pg_restore cleans the objects itself; dropping the database as well
    // would throw away the very data --clean is supposed to replace safely.
    expect(queriesRun().some((q) => q.includes("DROP DATABASE"))).toBe(false);
  });

  it("omits --clean from pg_restore when restoring into an empty target", async () => {
    makeCustomFormat();

    await runDbRestore("/backups/b.dump", { force: true });

    const args = mockSpawnSync.mock.calls[0][1] as string[];
    expect(args).not.toContain("--clean");
    expect(args).not.toContain("--if-exists");
  });

  it("drops and recreates the database for a plain-SQL dump with --clean", async () => {
    tablesInTarget = ["connection"];

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    // psql has no --clean, and a plain dump carries no DROP statements — the
    // objects must be gone before it replays, or every CREATE collides.
    const queries = queriesRun();
    expect(queries.some((q) => q === "DROP DATABASE IF EXISTS neoboard")).toBe(
      true,
    );
    expect(queries.some((q) => q === "CREATE DATABASE neoboard")).toBe(true);
    // Both must run against the maintenance database, not the one being dropped.
    const maintenance = mockRunFile.mock.calls.filter((c) =>
      sqlOf(c[1] as string[]).includes("DATABASE"),
    );
    expect(maintenance).toHaveLength(2);
    for (const call of maintenance) {
      const args = call[1] as string[];
      expect(args[args.indexOf("-d") + 1]).toBe("postgres");
    }
  });

  it("does not drop the database for a plain-SQL dump without --clean", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    expect(queriesRun().some((q) => q.includes("DROP DATABASE"))).toBe(false);
  });
});

describe("runDbRestore — failure of the underlying tool is a failure", () => {
  it("reports a non-zero psql exit, with its stderr", async () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stderr: Buffer.from('psql: FATAL: database "neoboard" does not exist'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await runDbRestore("/backups/b.sql", { force: true });

    expect(logError).toHaveBeenCalledWith(
      'psql: FATAL: database "neoboard" does not exist',
    );
    expect(success).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports a spawn error (tool not installed)", async () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error("spawnSync psql ENOENT"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await runDbRestore("/backups/b.sql", { force: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain("ENOENT");
    expect(process.exitCode).toBe(1);
  });

  it("fails on pg_restore's ignored errors, which it reports with exit 0", async () => {
    makeCustomFormat();
    mockSpawnSync.mockReturnValue({
      status: 0,
      stderr: Buffer.from(
        "pg_restore: error: could not execute query\n" +
          "pg_restore: warning: errors ignored on restore: 3",
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await runDbRestore("/backups/b.dump", { force: true });

    expect(vi.mocked(logError).mock.calls[0][0]).toContain(
      "errors ignored on restore: 3",
    );
    expect(success).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("runDbRestore — reporting what landed", () => {
  it("prints each restored table with its row count", async () => {
    tablesInTarget = ["connection", "dashboard"];
    rowCounts = "connection|3\ndashboard|7";

    await runDbRestore("/backups/b.sql", { clean: true, force: true });

    const printed = vi
      .mocked(info)
      .mock.calls.map((c) => c[0])
      .join("\n");
    expect(printed).toMatch(/connection\s+3/);
    expect(printed).toMatch(/dashboard\s+7/);
  });

  it("reports the age of the backup it restored", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    const printed = vi
      .mocked(info)
      .mock.calls.map((c) => c[0])
      .join("\n");
    expect(printed).toContain("2026-07-20T09:30:00");
  });

  it("says plainly when the restored database has no tables", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    const printed = vi
      .mocked(info)
      .mock.calls.map((c) => c[0])
      .join("\n");
    expect(printed).toContain("no tables");
  });
});

describe("runDbRestore — the restored credentials must be readable (#1274)", () => {
  it("confirms when the configured key decrypts the restored credentials", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    expect(mockProbe).toHaveBeenCalledWith("a".repeat(64));
    expect(
      vi
        .mocked(success)
        .mock.calls.map((c) => c[0])
        .join("\n"),
    ).toContain("decrypt");
    expect(process.exitCode).toBe(0);
  });

  it("fails the command when ENCRYPTION_KEY cannot read them", async () => {
    mockProbe.mockResolvedValue({ outcome: "mismatch" });

    await runDbRestore("/backups/b.sql", { force: true });

    const message = vi.mocked(logError).mock.calls[0][0];
    expect(message).toContain("ENCRYPTION_KEY");
    // The data landed — say so, so nobody re-runs the restore hoping to fix it.
    expect(message).toContain("restored");
    expect(process.exitCode).toBe(1);
  });

  it("does not claim success when there are no credentials to check", async () => {
    mockProbe.mockResolvedValue({ outcome: "no-credentials" });

    await runDbRestore("/backups/b.sql", { force: true });

    expect(
      vi
        .mocked(success)
        .mock.calls.map((c) => c[0])
        .join("\n"),
    ).not.toContain("decrypt");
    expect(process.exitCode).toBe(0);
  });

  it("runs the probe only after the restore has landed", async () => {
    const order: string[] = [];
    mockSpawnSync.mockImplementation(() => {
      order.push("restore");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: 0, stderr: Buffer.from("") } as any;
    });
    mockProbe.mockImplementation(async () => {
      order.push("probe");
      return { outcome: "ok" };
    });

    await runDbRestore("/backups/b.sql", { force: true });

    expect(order).toEqual(["restore", "probe"]);
  });

  it("reads the key from docker/.env in docker mode", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    expect(mockProbe).toHaveBeenCalledWith("a".repeat(64));
  });
});

describe("runDbRestore — argument shape", () => {
  it("never runs the restore tool through a shell", async () => {
    await runDbRestore("/backups/b.sql", { force: true });

    // Arguments go as an argv array, so a path or identifier can never be
    // re-parsed by a shell. Guards the same boundary `db dump` protects.
    expect(Array.isArray(mockSpawnSync.mock.calls[0][1])).toBe(true);
    expect(spawnArgs()[0]).not.toContain(";");
  });
});
