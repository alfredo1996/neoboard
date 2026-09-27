// `neoboard db migrate` and `npm run db:migrate` run this (#2019, #2041). The
// drizzle-kit binary both ran before exited 1 with nothing on stderr, so there
// was no error text to classify or show. This applies migrations with the
// server's own migrator.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  describeMigrationError,
  migrateWithLock,
} from "../app/src/lib/db/migrate.mjs";

/**
 * DATABASE_URL from the environment, else from app/.env.local, where
 * `neoboard init --mode local` writes it and where the CLI reads it. drizzle-kit
 * read only .env, so the documented local setup could not migrate (#2041).
 * ponytail: reads the one key this script needs, bare or quoted, not dotenv's
 * whole grammar (no multi-line values, no ${} expansion).
 */
export function databaseUrl(env, envLocalPath) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (!existsSync(envLocalPath)) return undefined;
  const line = readFileSync(envLocalPath, "utf8").match(
    /^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m,
  );
  if (!line) return undefined;
  const value = line[1];
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote)
    ? value.slice(1, -1)
    : value;
}

async function main() {
  const url = databaseUrl(
    process.env,
    fileURLToPath(new URL("../app/.env.local", import.meta.url)),
  );
  if (!url) {
    process.stderr.write(
      "DATABASE_URL is required to run migrations: set it, or run `neoboard env` to write app/.env.local\n",
    );
    process.exit(1);
  }

  try {
    await migrateWithLock(
      url,
      process.env.MIGRATIONS_DIR ??
        fileURLToPath(new URL("../app/drizzle/migrations", import.meta.url)),
      // A minute for a booting server to finish migrating; past that the lock
      // is stuck, and the command says so rather than hanging.
      {
        lockTimeoutMs: Number(process.env.MIGRATION_LOCK_TIMEOUT_MS) || 60_000,
      },
    );
  } catch (err) {
    process.stderr.write(`${describeMigrationError(err)}\n`);
    process.exit(1);
  }
}

// Run only as a command, so a test can import databaseUrl. Real paths on both
// sides: the ESM loader resolves the module's symlinks and argv does not, and
// a mismatch would skip the migration and exit 0 in silence.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
