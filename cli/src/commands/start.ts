import { composeUp } from "../lib/docker.js";
import { waitForHealth } from "../lib/health.js";
import { isPgReady, isNeo4jReady } from "../lib/docker.js";
import { readProjectConfig, getMode } from "../lib/config.js";
import { info, success, banner } from "../lib/output.js";
import { runDoctor, printResults } from "./doctor.js";
import { runDbMigrate } from "./db/migrate.js";

export async function runStart(): Promise<void> {
  // 1. Prerequisite checks
  const results = await runDoctor();
  const hasFailure = printResults(results);
  if (hasFailure) {
    process.exitCode = 1;
    return;
  }

  // 2. Start containers
  const mode = getMode();
  const full = mode === "docker";
  info(full ? "Starting full stack..." : "Starting database containers...");
  composeUp({ full });

  // 3. Wait for health
  const config = readProjectConfig();
  await waitForHealth({ check: isPgReady, label: "PostgreSQL" });
  await waitForHealth({ check: isNeo4jReady, label: "Neo4j" });

  // 4. Run migrations
  await runDbMigrate({});

  // 5. Done
  const url = `http://localhost:${config.ports.app}`;
  banner([
    "NeoBoard is running!",
    "",
    `App:        ${url}`,
    `Neo4j:      http://localhost:${config.ports.neo4j_http}`,
    `PostgreSQL: localhost:${config.ports.postgres}`,
  ]);
  success(`Open ${url} in your browser`);
}
