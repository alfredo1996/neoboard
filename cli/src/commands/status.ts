import { existsSync, readFileSync } from "node:fs";
import { composePs, isPgReady, isNeo4jReady } from "../lib/docker.js";
import { paths, getMode, readProjectConfig } from "../lib/config.js";
import { info } from "../lib/output.js";
import { runOrNull } from "../lib/exec.js";

function getAppHealth(port: number): string {
  const out = runOrNull(
    `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}`,
  );
  if (out === "200") return "healthy";
  if (out) return `unhealthy (HTTP ${out})`;
  return "not running";
}

function getMigrationStatus(): string {
  if (!existsSync(paths.journalPath)) return "no journal found";
  try {
    const journal = JSON.parse(readFileSync(paths.journalPath, "utf-8"));
    const count = journal.entries?.length ?? 0;
    const latest = journal.entries?.[count - 1]?.tag ?? "none";
    return `${count} applied (latest: ${latest})`;
  } catch {
    return "error reading journal";
  }
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(`${paths.root}/cli/package.json`, "utf-8"),
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function runStatus(): Promise<void> {
  const mode = getMode();
  const config = readProjectConfig();
  const containers = composePs();

  info(`Mode:        ${mode}`);
  info(`Version:     ${getVersion()}`);
  info(
    `Docker:      ${containers.length > 0 ? `running (${containers.length} containers)` : "no containers"}`,
  );
  info("");

  const pgHealthy = await isPgReady();
  const neo4jHealthy = isNeo4jReady();
  const appHealth = getAppHealth(config.ports.app);

  info("Service      Status");
  info("\u2500".repeat(30));
  info(
    `PostgreSQL   ${pgHealthy ? "healthy" : "stopped"} (localhost:${config.ports.postgres})`,
  );
  info(
    `Neo4j        ${neo4jHealthy ? "healthy" : "stopped"} (localhost:${config.ports.neo4j_bolt})`,
  );
  info(`App          ${appHealth} (http://localhost:${config.ports.app})`);
  info("");
  info(`Migrations:  ${getMigrationStatus()}`);
}
