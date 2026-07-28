import { openSync, closeSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { paths, readProjectConfig, getMode } from "../../lib/config.js";
import { success, error as logError, createSpinner } from "../../lib/output.js";

function defaultFilename(): string {
  const now = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `neoboard-dump-${now}.sql`;
}

export function formatSize(bytes: number): string {
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

  const spinner = createSpinner("Dumping database...");
  spinner.start();

  try {
    assertSafeValue(config.postgres.user, "postgres.user");
    assertSafeValue(config.postgres.database, "postgres.database");

    const mode = getMode();
    const pgArgs = ["-U", config.postgres.user];
    if (opts.dataOnly) pgArgs.push("--data-only");
    pgArgs.push(config.postgres.database);

    const bin = mode === "docker" ? "docker" : "pg_dump";
    const args =
      mode === "docker"
        ? ["exec", "neoboard-postgres", "pg_dump", ...pgArgs]
        : ["-h", "localhost", "-p", String(config.ports.postgres), ...pgArgs];

    // Stream pg_dump straight to the file (stdout → fd). Buffering it into a JS
    // string via execSync hit execSync's 1 MiB maxBuffer default → ENOBUFS for
    // any real database, so the "backup" wrote no file. Passing args as an
    // array (no shell) also means the output path never needs escaping. (#HIGH)
    const fd = openSync(outPath, "w");
    let result;
    try {
      result = spawnSync(bin, args, { stdio: ["ignore", fd, "pipe"] });
    } finally {
      closeSync(fd);
    }
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim();
      throw new Error(stderr || `pg_dump exited with code ${result.status}`);
    }

    const size = statSync(outPath).size;
    spinner.succeed(`Backup saved to ${outPath} (${formatSize(size)})`);
    success("Database dump complete");
  } catch (err) {
    spinner.fail("Database dump failed");
    logError((err as Error).message);
    process.exitCode = 1;
  }
}
