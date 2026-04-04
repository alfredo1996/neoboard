import { composeUp } from "../lib/docker.js";
import { waitForHealth } from "../lib/health.js";
import { isPgReady, isNeo4jReady } from "../lib/docker.js";
import { readProjectConfig, getMode } from "../lib/config.js";
import { info, success, warn, banner } from "../lib/output.js";
import { runDoctor, printResults } from "./doctor.js";
import { runDbMigrate } from "./db/migrate.js";

export async function runStart(): Promise<void> {
  const mode = getMode();
  const config = readProjectConfig();

  // 1. Prerequisite checks
  const results = await runDoctor();
  const hasFailure = printResults(results);
  if (hasFailure && mode === "docker") {
    process.exitCode = 1;
    return;
  }

  // 2. Start containers (only in Docker mode)
  if (mode === "docker") {
    const full = true;
    info("Starting full stack via Docker Compose...");
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
    throw new Error("PostgreSQL failed to start");
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
    throw new Error("Neo4j failed to start");
  }

  // 4. Run migrations
  await runDbMigrate({});

  // 5. Done
  const url = `http://localhost:${config.ports.app}`;
  banner([
    "NeoBoard is running!",
    "",
    `Mode:       ${mode}`,
    `App:        ${url}`,
    `Neo4j:      http://localhost:${config.ports.neo4j_http}`,
    `PostgreSQL: localhost:${config.ports.postgres}`,
  ]);
  success(`Open ${url} in your browser`);
}
