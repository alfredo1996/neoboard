import { existsSync, readFileSync } from "node:fs";
import { run } from "../../lib/exec.js";
import { dockerExec } from "../../lib/docker.js";
import { paths, getMode } from "../../lib/config.js";
import { info, success, warn, createSpinner } from "../../lib/output.js";

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

  const mode = getMode();
  if (mode === "docker") {
    dockerExec("neoboard-app", "npx drizzle-kit migrate");
  } else {
    run("npx drizzle-kit migrate", { cwd: paths.appDir });
  }

  spinner.succeed("Migrations applied");
  success("Database is up to date");
}
