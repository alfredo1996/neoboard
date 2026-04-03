import { existsSync } from "node:fs";
import { runOrNull } from "../lib/exec.js";
import { isPortAvailable } from "../lib/ports.js";
import { paths, readProjectConfig } from "../lib/config.js";
import { success, warn, error as logError } from "../lib/output.js";

export interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

export function checkDockerRunning(): CheckResult {
  const ok = runOrNull("docker info") !== null;
  return {
    name: "Docker daemon",
    status: ok ? "ok" : "fail",
    message: ok ? "Docker daemon running" : "Docker daemon not running",
  };
}

export function checkDockerComposeV2(): CheckResult {
  const out = runOrNull("docker compose version");
  const ok = out !== null && out.includes("v2");
  return {
    name: "Docker Compose v2",
    status: ok ? "ok" : "fail",
    message: ok ? "Docker Compose v2 available" : "Docker Compose v2 not found",
  };
}

export function checkNodeVersion(): CheckResult {
  const major = parseInt(process.version.slice(1), 10);
  const ok = major >= 20;
  return {
    name: "Node.js",
    status: ok ? "ok" : "fail",
    message: ok
      ? `Node.js ${process.version}`
      : `Node.js >= 20 required (found: ${process.version})`,
  };
}

export async function checkPortAvailable(
  port: number,
  label: string,
): Promise<CheckResult> {
  const available = await isPortAvailable(port);
  return {
    name: `Port ${port} (${label})`,
    status: available ? "ok" : "warn",
    message: available
      ? `Port ${port} available`
      : `Port ${port} in use — another process may be running`,
  };
}

export function checkNodeModulesExist(): CheckResult {
  const exists = existsSync(`${paths.appDir}/node_modules`);
  return {
    name: "Dependencies",
    status: exists ? "ok" : "warn",
    message: exists
      ? "app/node_modules exists"
      : "app/node_modules missing — run 'neoboard init'",
  };
}

export function checkEnvFileExists(): CheckResult {
  const exists = existsSync(paths.envFile);
  return {
    name: ".env.local",
    status: exists ? "ok" : "warn",
    message: exists
      ? "app/.env.local exists"
      : "app/.env.local missing — run 'neoboard env'",
  };
}

export async function runDoctor(): Promise<CheckResult[]> {
  const config = readProjectConfig();
  const results: CheckResult[] = [
    checkDockerRunning(),
    checkDockerComposeV2(),
    checkNodeVersion(),
  ];

  const portChecks = await Promise.all([
    checkPortAvailable(config.ports.postgres, "PostgreSQL"),
    checkPortAvailable(config.ports.neo4j_http, "Neo4j HTTP"),
    checkPortAvailable(config.ports.neo4j_bolt, "Neo4j Bolt"),
    checkPortAvailable(config.ports.app, "App"),
  ]);
  results.push(...portChecks);

  results.push(checkNodeModulesExist());
  results.push(checkEnvFileExists());

  return results;
}

export function printResults(results: CheckResult[]): boolean {
  let hasFailure = false;
  for (const r of results) {
    if (r.status === "ok") {
      success(r.message);
    } else if (r.status === "warn") {
      warn(r.message);
    } else {
      logError(r.message);
      hasFailure = true;
    }
  }
  return hasFailure;
}
