import {
  existsSync,
  openSync,
  closeSync,
  readSync,
  statSync,
  readFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { parse as parseEnv } from "dotenv";
import { runFile } from "../../lib/exec.js";
import { paths, readProjectConfig, getMode } from "../../lib/config.js";
import type { ProjectConfig } from "../../lib/config.js";
import { readDockerEnvSecrets } from "../../lib/docker-env.js";
import { isAppReady } from "../../lib/docker.js";
import { probeCredentialDecryption } from "../../lib/credential-probe.js";
import { confirm } from "../../lib/prompt.js";
import {
  info,
  success,
  error as logError,
  createSpinner,
} from "../../lib/output.js";
import { formatSize } from "./dump.js";

/**
 * Validate a PostgreSQL identifier before it is interpolated into SQL.
 *
 * `config set` does not validate string values, and the `--clean` path builds
 * `DROP DATABASE <name>` textually — an identifier is not parameterisable.
 * Stricter than `db dump`'s blocklist on purpose: this command runs DDL.
 * Same guard as `db reset` and `lib/docker.ts` at their own boundaries.
 */
function assertPgIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier for ${label}: "${value}"`);
  }
}

/**
 * Build a psql invocation as an argv array — no shell, ever.
 *
 * `ON_ERROR_STOP=1` is not optional: psql's default is to print an error,
 * carry on, and exit 0. A restore that reports success while half its
 * statements failed is the exact failure this command exists to prevent.
 */
function psqlArgv(
  config: ProjectConfig,
  extra: string[],
  database?: string,
): [string, string[]] {
  const target = database ?? config.postgres.database;
  const base = ["-U", config.postgres.user, "-d", target, ...extra];
  return getMode() === "docker"
    ? ["docker", ["exec", "neoboard-postgres", "psql", ...base]]
    : [
        "psql",
        ["-h", "localhost", "-p", String(config.ports.postgres), ...base],
      ];
}

/** Run one query and return its raw `-tA` output. Throws if psql fails. */
function query(config: ProjectConfig, sql: string, database?: string): string {
  const [bin, args] = psqlArgv(
    config,
    ["-v", "ON_ERROR_STOP=1", "-tAc", sql],
    database,
  );
  return runFile(bin, args);
}

function listTables(config: ProjectConfig): string[] {
  const out = query(
    config,
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  return out.split("\n").filter(Boolean);
}

/**
 * Custom-format archives (`pg_dump -Fc`) start with the magic bytes "PGDMP";
 * `neoboard db dump` writes plain SQL. Sniffing the header rather than the
 * extension means a `.sql` file that is really an archive still restores —
 * feeding one to psql produces pages of binary garbage and no explanation.
 */
function isCustomFormat(file: string): boolean {
  const fd = openSync(file, "r");
  try {
    const header = Buffer.alloc(5);
    readSync(fd, header, 0, 5, 0);
    return header.toString("utf-8") === "PGDMP";
  } finally {
    closeSync(fd);
  }
}

/** The ENCRYPTION_KEY as the running app would see it. */
function readEncryptionKey(): string | undefined {
  if (getMode() === "docker") return readDockerEnvSecrets().ENCRYPTION_KEY;
  if (!existsSync(paths.envFile)) return undefined;
  try {
    return parseEnv(readFileSync(paths.envFile, "utf-8")).ENCRYPTION_KEY;
  } catch {
    return undefined;
  }
}

/**
 * A plain dump carries no DROP statements and psql has no `--clean`, so the
 * objects have to be gone before it replays. Dropping the database (rather
 * than just `public`) also clears the `neoboard_demo_*` schemas, which a
 * whole-database dump recreates and would otherwise collide with.
 */
function dropAndRecreate(config: ProjectConfig): void {
  const { database } = config.postgres;
  query(config, `DROP DATABASE IF EXISTS ${database}`, "postgres");
  query(config, `CREATE DATABASE ${database}`, "postgres");
}

/**
 * The restore reads the dump from stdin, so this cannot reuse `psqlArgv`:
 * `docker exec` without `-i` gives the container no stdin at all, and the
 * restore then "succeeds" against an empty stream.
 */
function restoreArgv(
  config: ProjectConfig,
  opts: { custom: boolean; clean: boolean },
): [string, string[]] {
  const { user, database } = config.postgres;
  const tool = opts.custom ? "pg_restore" : "psql";
  const args = ["-U", user, "-d", database];
  if (opts.custom && opts.clean) args.push("--clean", "--if-exists");
  if (!opts.custom) args.push("-v", "ON_ERROR_STOP=1");

  return getMode() === "docker"
    ? ["docker", ["exec", "-i", "neoboard-postgres", tool, ...args]]
    : [tool, ["-h", "localhost", "-p", String(config.ports.postgres), ...args]];
}

/** Print each restored table and its exact row count. */
function reportContents(config: ProjectConfig): void {
  const tables = listTables(config).filter((t) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(t),
  );
  if (tables.length === 0) {
    info("Restored database contains no tables — was the dump empty?");
    return;
  }

  // Exact counts, one round trip. `n_live_tup` would be cheaper but it is an
  // estimate, and an estimate is not a verification.
  const sql = tables
    .map((t) => `SELECT '${t}' AS t, count(*) AS n FROM "${t}"`)
    .join(" UNION ALL ");
  const rows = query(config, sql)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|"));

  const width = Math.max(...tables.map((t) => t.length));
  info(`Restored ${rows.length} tables:`);
  for (const [name, count] of rows) info(`  ${name.padEnd(width)}  ${count}`);
}

/** Report whether the current key can read what was just restored (#1274). */
async function reportCredentialDecryption(): Promise<void> {
  const { outcome } = await probeCredentialDecryption(readEncryptionKey());
  switch (outcome) {
    case "ok":
      success("Stored credentials decrypt with the configured ENCRYPTION_KEY");
      return;
    case "mismatch":
      // The rows are restored and re-running will not change that — the dump
      // was taken under a different key. Non-zero because the recovery has
      // not actually succeeded: every connector is unusable.
      logError(
        "Data restored, but ENCRYPTION_KEY cannot decrypt the restored " +
          "credentials — the dump was taken under a different key. Restore " +
          "that key (re-running this command will not help).",
      );
      process.exitCode = 1;
      return;
    case "no-credentials":
      info("No stored credentials in the restored data — key unverified.");
      return;
    default:
      info("Could not read the restored data to verify ENCRYPTION_KEY.");
  }
}

export async function runDbRestore(
  file: string,
  opts: { clean?: boolean; force?: boolean },
): Promise<void> {
  const spinner = createSpinner("Restoring database...");

  try {
    if (!existsSync(file)) throw new Error(`Backup file not found: ${file}`);

    const config = readProjectConfig();
    const { user, database } = config.postgres;
    assertPgIdentifier(user, "postgres.user");
    assertPgIdentifier(database, "postgres.database");

    // Reachability and emptiness in one query: a database we cannot read is
    // not a database we may restore into, and "unreachable" must never be
    // mistaken for "empty".
    let existing: string[];
    try {
      existing = listTables(config);
    } catch {
      throw new Error(
        `Cannot reach database "${database}" as user "${user}". Refusing to ` +
          `restore — start PostgreSQL (\`neoboard start\`) and try again.`,
      );
    }

    if (existing.length > 0 && !opts.clean) {
      throw new Error(
        `Target database "${database}" is not empty — found ${existing.length} ` +
          `tables: ${existing.join(", ")}.\nRestoring over them fails partway ` +
          `with duplicate-key errors. Pass --clean to drop them first.`,
      );
    }

    // The production image bakes MIGRATE_ON_START=1 (Dockerfile) and no
    // compose file passes an override, so reading the env file would report
    // "off" for an instance that is definitely on. Whether the app ANSWERS is
    // the honest check: a live app has already created the schema, will
    // migrate again on restart, and holds connections that block DROP
    // DATABASE.
    if (!opts.force && isAppReady()) {
      throw new Error(
        "NeoBoard is running and boots with MIGRATE_ON_START enabled — it " +
          "will recreate the schema underneath this restore. Stop the app " +
          "first, or pass --force.",
      );
    }

    if (!opts.force) {
      const proceed = await confirm(
        `This will overwrite the contents of database "${database}". Continue?`,
      );
      if (!proceed) {
        info("Aborted.");
        return;
      }
    }

    const custom = isCustomFormat(file);
    // pg_restore does its own cleaning; dropping the database as well would
    // discard the data before pg_restore could fail safely against it.
    if (opts.clean && !custom) dropAndRecreate(config);

    spinner.start();
    const [bin, args] = restoreArgv(config, {
      custom,
      clean: Boolean(opts.clean),
    });

    // Stream the dump straight from a file descriptor into the tool's stdin,
    // mirroring `db dump` — never buffered into JS, and `docker exec -i` so
    // the container actually receives it.
    //
    // stdout is ignored rather than piped: it is only psql's per-statement
    // command tags, and spawnSync buffers pipes at a 1 MiB maxBuffer — the
    // same ENOBUFS that once made `db dump` write no file at all.
    const fd = openSync(file, "r");
    let result;
    try {
      result = spawnSync(bin, args, { stdio: [fd, "ignore", "pipe"] });
    } finally {
      closeSync(fd);
    }

    if (result.error) throw result.error;
    const stderr = result.stderr?.toString().trim() ?? "";
    if (result.status !== 0) {
      throw new Error(
        stderr ||
          `${custom ? "pg_restore" : "psql"} exited with ${result.status}`,
      );
    }
    // pg_restore exits 0 after skipping failed statements, reporting the
    // count only in stderr. Silence about that is how a restore "succeeds"
    // with empty tables.
    if (/errors ignored on restore: \d+/.test(stderr)) {
      throw new Error(stderr);
    }

    const stat = statSync(file);
    spinner.succeed(`Restored from ${file}`);
    info(
      `Backup: ${formatSize(stat.size)}, written ${stat.mtime.toISOString()}`,
    );
    reportContents(config);
    await reportCredentialDecryption();
  } catch (err) {
    spinner.fail("Database restore failed");
    logError((err as Error).message);
    process.exitCode = 1;
  }
}
