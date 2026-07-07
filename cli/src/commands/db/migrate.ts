import { existsSync, readFileSync } from "node:fs";
import { run, ExecError } from "../../lib/exec.js";
import { paths, readProjectConfig } from "../../lib/config.js";
import {
  info,
  success,
  warn,
  error as logError,
  createSpinner,
} from "../../lib/output.js";

/**
 * Resolve the DATABASE_URL for migrations.
 * Priority: 1) .env.local  2) built from neoboard.config.json
 * This works regardless of where the DB runs (Docker, local, remote).
 */
function resolveDatabaseUrl(): string {
  // Check .env.local first — user may have a custom DB host
  if (existsSync(paths.envFile)) {
    const content = readFileSync(paths.envFile, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      const m = trimmed.match(/^DATABASE_URL\s*=\s*(.+)$/);
      if (m) {
        let url = m[1].trim();
        if (
          (url.startsWith('"') && url.endsWith('"')) ||
          (url.startsWith("'") && url.endsWith("'"))
        ) {
          url = url.slice(1, -1);
        }
        if (url) return url;
      }
    }
  }
  // Fallback: build from config (assumes DB is on localhost via Docker port mapping)
  const config = readProjectConfig();
  const user = encodeURIComponent(config.postgres.user);
  const pass = encodeURIComponent(config.postgres.password);
  const db = encodeURIComponent(config.postgres.database);
  return `postgresql://${user}:${pass}@localhost:${config.ports.postgres}/${db}`;
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

interface Journal {
  version: string;
  entries: JournalEntry[];
}

function readJournal(): Journal | null {
  if (!existsSync(paths.journalPath)) return null;
  try {
    return JSON.parse(readFileSync(paths.journalPath, "utf-8"));
  } catch {
    return null;
  }
}

export function showMigrationStatus(): void {
  const journal = readJournal();
  if (!journal) {
    warn("No migration journal found.");
    return;
  }

  info(`Migrations: ${journal.entries.length} available`);
  for (const entry of journal.entries) {
    const date = new Date(entry.when).toISOString().slice(0, 10);
    info(`  ${entry.idx}: ${entry.tag} (${date})`);
  }
}

export function showDryRun(): void {
  const journal = readJournal();
  if (!journal) {
    warn("No migration journal found.");
    return;
  }
  info(`Would apply ${journal.entries.length} migration(s):`);
  for (const entry of journal.entries) {
    info(`  - ${entry.tag}`);
  }
}

/**
 * Applies pending migrations. Returns true on success (or for the
 * informational --status / --dry-run modes), false when a migration fails —
 * so callers like `runStart`/`runDbReset` can abort instead of seeding against
 * a schema-less database and reporting a false "ready". (#MEDIUM)
 */
export async function runDbMigrate(opts: {
  status?: boolean;
  to?: string;
  dryRun?: boolean;
}): Promise<boolean> {
  if (opts.status) {
    showMigrationStatus();
    return true;
  }

  if (opts.dryRun) {
    showDryRun();
    return true;
  }

  info("Tip: Run 'neoboard db dump' to backup before migrating");

  if (opts.to) {
    warn(
      `--to ${opts.to}: Drizzle Kit applies all pending migrations. Version validation is not yet supported.`,
    );
  }

  const spinner = createSpinner("Running migrations...");
  spinner.start();

  // Resolve DATABASE_URL: use .env.local if set, otherwise build from config.
  // This works regardless of where the DB runs (Docker, local, remote).
  const dbUrl = resolveDatabaseUrl();
  try {
    run("npx drizzle-kit migrate", {
      cwd: paths.appDir,
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (err) {
    spinner.fail("Migration failed");
    reportMigrateFailure(err);
    process.exitCode = 1;
    return false;
  }

  spinner.succeed("Migrations applied");
  success("Database is up to date");
  return true;
}

type MigrateErrorKind = "connection" | "lock" | "schema" | "unknown";

/**
 * Classify a drizzle-kit / postgres failure by inspecting stderr text.
 * Kept simple on purpose — the goal is to point the user at the right
 * troubleshooting bucket, not to be exhaustive.
 */
export function classifyMigrateError(stderr: string): MigrateErrorKind {
  const s = stderr.toLowerCase();
  if (
    s.includes("econnrefused") ||
    s.includes("connection refused") ||
    s.includes("password authentication failed") ||
    s.includes("no pg_hba.conf entry") ||
    s.includes("getaddrinfo") ||
    s.includes("connect etimedout") ||
    s.includes("self signed certificate") ||
    s.includes("ssl")
  ) {
    return "connection";
  }
  if (
    s.includes("advisory lock") ||
    s.includes("could not obtain lock") ||
    s.includes("lock timeout") ||
    s.includes("deadlock detected")
  ) {
    return "lock";
  }
  if (
    s.includes("already exists") ||
    s.includes("does not exist") ||
    s.includes("syntax error") ||
    s.includes("violates") ||
    s.includes("constraint")
  ) {
    return "schema";
  }
  return "unknown";
}

/**
 * Strip credential-bearing patterns from stderr before surfacing it to the
 * user (CLI output is commonly pasted into issues / shared logs).
 * Covers postgres DSNs and `password=...` / `access_token=...` query patterns.
 */
export function redactSensitiveDetails(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)([^@\s]+)(@)/gi, "$1***$3")
    .replace(/(\b(?:password|access_token)\s*=\s*)(\S+)/gi, "$1***");
}

function extractStderr(err: unknown): string {
  if (err instanceof ExecError) return err.stderr;
  if (err instanceof Error) return err.message;
  return String(err);
}

function reportMigrateFailure(err: unknown): void {
  const stderr = extractStderr(err);
  const kind = classifyMigrateError(stderr);

  switch (kind) {
    case "connection":
      logError("Database connection problem detected.");
      logError("  • Confirm DATABASE_URL points at a reachable server.");
      logError(
        "  • If using Docker: `docker compose ps` — is postgres running and healthy?",
      );
      logError(
        "  • If using `neoboard start`: wait a few seconds for the DB to finish booting, then retry.",
      );
      logError(
        "  • Check credentials in .env.local match neoboard.config.json.",
      );
      break;
    case "lock":
      logError("Migration is blocked by another process holding the lock.");
      logError(
        "  • Another `neoboard db migrate` may be running — wait for it to finish.",
      );
      logError(
        "  • If nothing else is running, an earlier crash may have left a stale lock; restart postgres or contact your DBA.",
      );
      break;
    case "schema":
      logError("Schema conflict: the migration cannot apply cleanly.");
      logError(
        "  • NeoBoard migrations are forward-only — manual schema edits cause drift.",
      );
      logError(
        "  • Pre-launch only: `neoboard db reset` wipes data and re-applies all migrations.",
      );
      logError(
        "  • Production: revert manual changes, or write a new migration that reconciles the drift.",
      );
      break;
    case "unknown":
      logError("Migration failed with an unrecognized error.");
      logError("See `neoboard db migrate --status` for current state.");
      break;
  }

  // Always surface the underlying message so users have something to grep / paste in issues.
  if (stderr.trim()) {
    logError("");
    logError("Underlying error:");
    logError(redactSensitiveDetails(stderr.trim()));
  }
}
