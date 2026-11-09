import {
  readProjectConfig,
  readLocalConfig,
  readTrackedConfig,
  validPorts,
  writeProjectConfig,
  paths,
} from "../lib/config.js";
import { info, success, warn, error as logError } from "../lib/output.js";
import type { ProjectConfig } from "../lib/config.js";

type FlatKey =
  | "ports.app"
  | "ports.postgres"
  | "ports.neo4j_http"
  | "ports.neo4j_bolt"
  | "postgres.user"
  | "postgres.password"
  | "postgres.database"
  | "neo4j.user"
  | "neo4j.password"
  | "seed.script"
  | "seed.neo4j_cypher";

function getNestedValue(obj: ProjectConfig, key: FlatKey): unknown {
  const [section, prop] = key.split(".") as [keyof ProjectConfig, string];
  return (obj[section] as Record<string, unknown>)[prop];
}

// #2100: parseInt read "7688x" as 7688; a port is digits only, 1 to 65535.
function parsePort(key: FlatKey, value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid port value for ${key}: "${value}" is not a whole number from 1 to 65535`,
    );
  }
  return port;
}

function setNestedValue(
  obj: ProjectConfig,
  key: FlatKey,
  value: string,
): ProjectConfig {
  const [section, prop] = key.split(".") as [keyof ProjectConfig, string];
  const parsed = section === "ports" ? parsePort(key, value) : value;
  return {
    ...obj,
    [section]: {
      ...(obj[section] as Record<string, unknown>),
      [prop]: parsed,
    },
  };
}

const VALID_KEYS: FlatKey[] = [
  "ports.app",
  "ports.postgres",
  "ports.neo4j_http",
  "ports.neo4j_bolt",
  "postgres.user",
  "postgres.password",
  "postgres.database",
  "neo4j.user",
  "neo4j.password",
  "seed.script",
  "seed.neo4j_cypher",
];

export function runConfigList(): void {
  const config = readProjectConfig();
  const localPorts = validPorts(readLocalConfig().ports);
  info(`Config: ${paths.projectConfig}\n`);
  for (const key of VALID_KEYS) {
    const value = getNestedValue(config, key);
    const local = key.startsWith("ports.") && key.slice(6) in localPorts;
    info(`  ${key} = ${value}${local ? "  (from .neoboard.local)" : ""}`);
  }
}

export function runConfigGet(key: string): void {
  if (!VALID_KEYS.includes(key as FlatKey)) {
    logError(
      `Unknown key: "${key}". Valid keys:\n  ${VALID_KEYS.join("\n  ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const config = readProjectConfig();
  const value = getNestedValue(config, key as FlatKey);
  console.log(String(value));
}

export function runConfigSet(key: string, value: string): void {
  if (!VALID_KEYS.includes(key as FlatKey)) {
    logError(
      `Unknown key: "${key}". Valid keys:\n  ${VALID_KEYS.join("\n  ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const localPorts = validPorts(readLocalConfig().ports);
  const portKey = key.replace("ports.", "") as keyof typeof localPorts;
  if (key.startsWith("ports.") && localPorts[portKey] !== undefined) {
    warn(
      `${key} is overridden in .neoboard.local (${localPorts[portKey]}); edit that file instead.`,
    );
    return;
  }
  const config = readTrackedConfig(); // never write a local override into the tracked file
  const updated = setNestedValue(config, key as FlatKey, value);
  writeProjectConfig(updated);
  success(`Set ${key} = ${getNestedValue(updated, key as FlatKey)}`);
  // No Docker-mode caveat any more: the compose files read ${NEOBOARD_PORT_*}
  // and composeUp passes them from this config, so the value binds in both
  // modes (#1313). The warning that used to live here (#998) told the user to
  // hand-edit the compose file, which would now fight the substitution.
}
