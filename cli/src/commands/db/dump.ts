import { writeFileSync, statSync } from "node:fs";
import { run } from "../../lib/exec.js";
import { paths, readProjectConfig, getMode } from "../../lib/config.js";
import { success, error as logError, createSpinner } from "../../lib/output.js";

function defaultFilename(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `neoboard-dump-${now}.sql`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assertSafeValue(value: string, label: string): void {
  if (/[;&|`$"'\\<>(){}!\n\r]/.test(value)) {
    throw new Error(
      `Unsafe characters in ${label}: "${value}". Check neoboard.config.json.`,
    );
  }
}

export async function runDbDump(opts: {
  output?: string;
  dataOnly?: boolean;
}): Promise<void> {
  const config = readProjectConfig();
  const outPath = opts.output ?? `${paths.root}/${defaultFilename()}`;
  const dataFlag = opts.dataOnly ? " --data-only" : "";

  const spinner = createSpinner("Dumping database...");
  spinner.start();

  try {
    assertSafeValue(config.postgres.user, "postgres.user");
    assertSafeValue(config.postgres.database, "postgres.database");

    const mode = getMode();
    let sql: string;
    if (mode === "docker") {
      sql = run(
        `docker exec neoboard-postgres pg_dump -U ${config.postgres.user} ${config.postgres.database}${dataFlag}`,
      );
    } else {
      sql = run(
        `pg_dump -h localhost -p ${config.ports.postgres} -U ${config.postgres.user} ${config.postgres.database}${dataFlag}`,
      );
    }

    writeFileSync(outPath, sql);
    const size = statSync(outPath).size;
    spinner.succeed(`Backup saved to ${outPath} (${formatSize(size)})`);
    success("Database dump complete");
  } catch (err) {
    spinner.fail("Database dump failed");
    logError((err as Error).message);
    process.exitCode = 1;
  }
}
