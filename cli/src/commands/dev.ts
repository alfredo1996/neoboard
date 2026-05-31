import { spawn } from "../lib/exec.js";
import { paths, getMode, readProjectConfig } from "../lib/config.js";
import { info, warn, banner } from "../lib/output.js";
import { isPgReady, isNeo4jReady, composeUp } from "../lib/docker.js";
import { waitForHealth } from "../lib/health.js";
import { validateEnv } from "./env.js";

export async function runDev(): Promise<void> {
  const mode = getMode();
  const config = readProjectConfig();

  if (mode === "docker") {
    info(
      "In Docker mode, the app runs inside the container. Use 'neoboard start' and visit http://localhost:3000.",
    );
    process.exitCode = 1;
    return;
  }

  // Validate env before starting
  const envResult = validateEnv();
  if (!envResult.ok) {
    warn(
      `Missing environment variables: ${envResult.missing.join(", ")}. Run 'neoboard env' to generate .env.local.`,
    );
    process.exitCode = 1;
    return;
  }

  // Check if databases are running; if not, start Docker containers for DBs
  const pgUp = isPgReady();
  const neo4jUp = isNeo4jReady();

  if (!pgUp || !neo4jUp) {
    info("Databases not running — starting via Docker Compose...");
    try {
      composeUp({ full: false });
      await waitForHealth({ check: isPgReady, label: "PostgreSQL" });
      await waitForHealth({ check: isNeo4jReady, label: "Neo4j" });
    } catch {
      warn(
        "Could not start databases. Start PostgreSQL and Neo4j manually, or run 'neoboard start' first.",
      );
      process.exitCode = 1;
      return;
    }
  }

  banner([
    "Starting NeoBoard dev server...",
    "",
    `App:        http://localhost:${config.ports.app}`,
    `PostgreSQL: localhost:${config.ports.postgres}`,
    `Neo4j:      http://localhost:${config.ports.neo4j_http}`,
    "",
    "Press Ctrl+C to stop.",
  ]);

  const child = spawn("npm", ["run", "dev"], { cwd: paths.appDir });

  const cleanup = () => child.kill();
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });
}
