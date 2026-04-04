import { readFileSync } from "node:fs";
import { run } from "../../lib/exec.js";
import { dockerExec } from "../../lib/docker.js";
import { paths, readProjectConfig, getMode } from "../../lib/config.js";
import {
  info,
  success,
  error as logError,
  createSpinner,
} from "../../lib/output.js";
import { confirm } from "../../lib/prompt.js";
import { runDbMigrate } from "./migrate.js";
import { runDbSeed } from "./seed.js";

/** Validate a PostgreSQL identifier to prevent SQL injection. */
function assertPgIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier for ${label}: "${value}"`);
  }
}

function getDatabaseHost(): string {
  try {
    const content = readFileSync(paths.envFile, "utf-8");
    const match = content.match(/DATABASE_URL=.*@([^:/]+)/);
    return match?.[1] ?? "localhost";
  } catch {
    return "localhost";
  }
}

function isLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

export async function runDbReset(opts?: {
  noSeed?: boolean;
  force?: boolean;
}): Promise<void> {
  const host = getDatabaseHost();
  if (!isLocalhost(host)) {
    logError(
      `Refusing to reset: DATABASE_URL points to '${host}' (not localhost). This command only works on local databases.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!opts?.force) {
    const confirmed = await confirm(
      "This will DROP the neoboard database and recreate it. Continue?",
    );
    if (!confirmed) {
      info("Aborted.");
      return;
    }
  }

  const config = readProjectConfig();
  const mode = getMode();
  const { user, database } = config.postgres;

  // Validate identifiers to prevent SQL injection via config values
  assertPgIdentifier(user, "postgres.user");
  assertPgIdentifier(database, "postgres.database");

  const spinner = createSpinner("Resetting database...");
  spinner.start();

  if (mode === "docker") {
    // Connect to 'postgres' db to drop/create target db
    dockerExec(
      "neoboard-postgres",
      `psql -U ${user} -d postgres -c "DROP DATABASE IF EXISTS ${database}"`,
    );
    dockerExec(
      "neoboard-postgres",
      `psql -U ${user} -d postgres -c "CREATE DATABASE ${database}"`,
    );
  } else {
    run(
      `psql -h localhost -U ${user} -d postgres -c "DROP DATABASE IF EXISTS ${database}"`,
    );
    run(
      `psql -h localhost -U ${user} -d postgres -c "CREATE DATABASE ${database}"`,
    );
  }

  spinner.succeed("Database dropped and recreated");

  // Replay migrations
  await runDbMigrate({});

  // Re-seed unless --no-seed
  if (!opts?.noSeed) {
    await runDbSeed();
  }

  success("Database reset complete");
}
