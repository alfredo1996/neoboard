import { createConnection } from "node:net";
import { run, runOrNull, dockerExec as execInContainer } from "./exec.js";
import { paths, readProjectConfig, getMode } from "./config.js";
import { join } from "node:path";

export function isDockerRunning(): boolean {
  return runOrNull("docker info") !== null;
}

export function isComposeV2(): boolean {
  const out = runOrNull("docker compose version");
  return out !== null && out.includes("v2");
}

export function composeFile(full = false): string {
  const name = full ? "docker-compose.full.yml" : "docker-compose.yml";
  return join(paths.dockerDir, name);
}

export function composeUp(opts?: { full?: boolean }): void {
  const file = composeFile(opts?.full);
  run(`docker compose -f ${file} up -d --build`, { cwd: paths.root });
}

export function composeDown(opts?: { volumes?: boolean }): void {
  const file = composeFile();
  const flags = opts?.volumes ? " -v" : "";
  run(`docker compose -f ${file} down${flags}`, { cwd: paths.root });
}

export interface ContainerInfo {
  name: string;
  state: string;
  status: string;
}

export function composePs(): ContainerInfo[] {
  const file = composeFile();
  const out = runOrNull(`docker compose -f ${file} ps --format json`, {
    cwd: paths.root,
  });
  if (!out) return [];
  try {
    // docker compose ps --format json outputs one JSON object per line
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const obj = JSON.parse(line);
        return {
          name: obj.Name ?? obj.name ?? "",
          state: obj.State ?? obj.state ?? "",
          status: obj.Status ?? obj.status ?? "",
        };
      });
  } catch {
    return [];
  }
}

export function dockerExec(
  container: string,
  cmd: string,
  opts?: { env?: Record<string, string> },
): string {
  return execInContainer(container, cmd, opts);
}

/** Check if a TCP port is accepting connections. */
export function isTcpReady(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 2000 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export function isPgReady(): boolean {
  const config = readProjectConfig();
  const mode = getMode();
  if (mode === "local") {
    // In local mode, use pg_isready directly against localhost
    return (
      runOrNull(
        `pg_isready -h localhost -p ${config.ports.postgres} -U ${config.postgres.user}`,
      ) !== null
    );
  }
  try {
    execInContainer(
      "neoboard-postgres",
      `pg_isready -U ${config.postgres.user}`,
    );
    return true;
  } catch {
    return false;
  }
}

export function isNeo4jReady(): boolean {
  const config = readProjectConfig();
  const mode = getMode();
  if (mode === "local") {
    const out = runOrNull(
      `curl -s -o /dev/null -w "%{http_code}" http://localhost:${config.ports.neo4j_http}`,
    );
    return out === "200";
  }
  // Use Docker's built-in health status — much faster than spawning
  // cypher-shell (JVM startup) on every poll.
  const status = runOrNull(
    "docker inspect --format={{.State.Health.Status}} neoboard-neo4j",
  );
  return status?.trim() === "healthy";
}

/**
 * Probes the Next.js app's /api/health endpoint. Returns true on HTTP 200.
 * Used after the full-stack docker compose so the CLI can signal "ready"
 * to the user instead of going silent while the app container boots.
 */
export function isAppReady(): boolean {
  const config = readProjectConfig();
  const out = runOrNull(
    `curl -s -o /dev/null -w "%{http_code}" http://localhost:${config.ports.app}/api/health`,
  );
  return out === "200";
}
