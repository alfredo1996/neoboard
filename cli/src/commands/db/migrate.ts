import { existsSync, readFileSync } from "node:fs";
import { run } from "../../lib/exec.js";
import { paths, readProjectConfig } from "../../lib/config.js";
import { info, success, warn, createSpinner } from "../../lib/output.js";

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
      if (trimmed.startsWith("DATABASE_URL=")) {
        const url = trimmed.slice("DATABASE_URL=".length).trim();
        if (url) return url;
      }
    }
  }
  // Fallback: build from config (assumes DB is on localhost via Docker port mapping)
  const config = readProjectConfig();
  return `postgresql://${config.postgres.user}:${config.postgres.password}@localhost:${config.ports.postgres}/${config.postgres.database}`;
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

export async function runDbMigrate(opts: {
  status?: boolean;
  to?: string;
  dryRun?: boolean;
}): Promise<void> {
  if (opts.status) {
    showMigrationStatus();
    return;
  }

  if (opts.dryRun) {
    showDryRun();
    return;
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
  run("npx drizzle-kit migrate", {
    cwd: paths.appDir,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  spinner.succeed("Migrations applied");
  success("Database is up to date");
}
