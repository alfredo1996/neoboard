import { run, runOrNull, dockerExec as execInContainer } from "./exec.js";
import { paths, readProjectConfig } from "./config.js";
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

export function dockerExec(container: string, cmd: string): string {
  return execInContainer(container, cmd);
}

export function isPgReady(): boolean {
  const config = readProjectConfig();
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
  try {
    execInContainer(
      "neoboard-neo4j",
      `cypher-shell -u ${config.neo4j.user} -p ${config.neo4j.password} RETURN 1`,
    );
    return true;
  } catch {
    return false;
  }
}
