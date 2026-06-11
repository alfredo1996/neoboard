import {
  readProjectConfig,
  writeProjectConfig,
  paths,
  getMode,
} from "../lib/config.js";
import { warn, info, success, error as logError } from "../lib/output.js";
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

function setNestedValue(
  obj: ProjectConfig,
  key: FlatKey,
  value: string,
): ProjectConfig {
  const [section, prop] = key.split(".") as [keyof ProjectConfig, string];
  const numericKeys = [
    "ports.app",
    "ports.postgres",
    "ports.neo4j_http",
    "ports.neo4j_bolt",
  ];
  const isNumeric = numericKeys.includes(key);
  const parsed = isNumeric ? parseInt(value, 10) : value;
  if (isNumeric && isNaN(parsed as number)) {
    throw new Error(
      `Invalid port value for ${key}: "${value}" is not a number`,
    );
  }
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
  info(`Config: ${paths.projectConfig}\n`);
  for (const key of VALID_KEYS) {
    const value = getNestedValue(config, key);
    info(`  ${key} = ${value}`);
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
  const config = readProjectConfig();
  const updated = setNestedValue(config, key as FlatKey, value);
  writeProjectConfig(updated);
  success(`Set ${key} = ${value}`);

  // Port changes are honored by the CLI's probes/banners, but the Docker
  // compose files publish fixed host ports — so in Docker mode the new
  // value is partially fictional (#998). Warn rather than silently mislead.
  if (key.startsWith("ports.") && getMode() === "docker") {
    warn(
      `Docker mode publishes fixed ports from docker/docker-compose.yml — ` +
        `${key} won't change the container's published port. ` +
        `Edit the compose file (or use local mode) to remap it.`,
    );
  }
}
