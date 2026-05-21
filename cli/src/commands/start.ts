import { composeUp } from "../lib/docker.js";
import { waitForHealth } from "../lib/health.js";
import { isPgReady, isNeo4jReady, isAppReady } from "../lib/docker.js";
import { readProjectConfig, getMode } from "../lib/config.js";
import { info, success, warn, banner, error } from "../lib/output.js";
import { runDoctor, printResults } from "./doctor.js";
import { runDbMigrate } from "./db/migrate.js";

export interface StartOptions {
  /**
   * When true, starts the full stack (app + DBs) via docker-compose.full.yml.
   * When false (default), starts DBs only via docker-compose.yml.
   * Only applies to Docker mode.
   */
  full?: boolean;
}

export async function runStart(opts?: StartOptions): Promise<void> {
  const mode = getMode();
  const config = readProjectConfig();
  const full = opts?.full ?? false;

  // 1. Prerequisite checks
  const results = await runDoctor();
  const hasFailure = printResults(results);
  if (hasFailure && mode === "docker") {
    process.exitCode = 1;
    return;
  }

  // 2. Start containers (only in Docker mode)
  if (mode === "docker") {
    if (full) {
      info("Starting full stack (app + databases) via Docker Compose...");
    } else {
      info("Starting database containers via Docker Compose...");
    }
    composeUp({ full });
  } else {
    info(
      "Local mode — skipping Docker. Ensure PostgreSQL and Neo4j are running.",
    );
  }

  // 3. Wait for health
  try {
    await waitForHealth({ check: isPgReady, label: "PostgreSQL" });
  } catch {
    if (mode === "local") {
      warn(
        `PostgreSQL not reachable on localhost:${config.ports.postgres}. Start it manually or use --mode docker.`,
      );
      process.exitCode = 1;
      return;
    }
    failWithHints("PostgreSQL failed to start");
    return;
  }

  try {
    await waitForHealth({ check: isNeo4jReady, label: "Neo4j" });
  } catch {
    if (mode === "local") {
      warn(
        `Neo4j not reachable on localhost:${config.ports.neo4j_http}. Start it manually or use --mode docker.`,
      );
      process.exitCode = 1;
      return;
    }
    failWithHints("Neo4j failed to start");
    return;
  }

  // When the full stack is up, the Next.js app container takes another
  // 30–60s to boot. Poll /api/health so the CLI doesn't go silent and
  // the user gets a clear "ready" signal before the banner prints.
  if (full && mode === "docker") {
    try {
      await waitForHealth({ check: isAppReady, label: "NeoBoard app" });
    } catch {
      failWithHints("NeoBoard app failed to start");
      return;
    }
  }

  // 4. Run migrations
  await runDbMigrate({});

  // 5. Done
  const url = `http://localhost:${config.ports.app}`;
  banner([
    "NeoBoard is running!",
    "",
    `Mode:       ${mode}${full ? " (full stack)" : ""}`,
    `App:        ${url}`,
    `Neo4j:      http://localhost:${config.ports.neo4j_http}`,
    `PostgreSQL: localhost:${config.ports.postgres}`,
    "",
    `Stop:       neoboard stop`,
    `Logs:       neoboard logs -f`,
  ]);
  success(`Open ${url} in your browser`);
}

/**
 * Print a red ERROR line followed by remediation hints, then mark the
 * process for a non-zero exit. Centralizes the "what to do next" message
 * for any docker-mode healthcheck timeout.
 */
function failWithHints(reason: string): void {
  error(reason);
  console.log("");
  console.log("  See logs:  neoboard logs -f");
  console.log("  Diagnose:  neoboard doctor");
  process.exitCode = 1;
}
