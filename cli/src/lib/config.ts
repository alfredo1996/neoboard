import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Types
export interface ProjectConfig {
  ports: {
    app: number;
    postgres: number;
    neo4j_http: number;
    neo4j_bolt: number;
  };
  postgres: { user: string; password: string; database: string };
  neo4j: { user: string; password: string };
  seed: { script: string; neo4j_cypher: string };
}

export interface LocalConfig {
  mode: "docker" | "local";
}

// Project root detection
export function findProjectRoot(startDir?: string): string {
  let dir = startDir ?? dirname(fileURLToPath(import.meta.url));
  while (dir !== "/") {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "neoboard") return dir;
      } catch {
        /* skip */
      }
    }
    dir = dirname(dir);
  }
  throw new Error(
    "Could not find NeoBoard project root (package.json with name 'neoboard')",
  );
}

// Path constants (lazy-initialized)
let _root: string | null = null;
function root(): string {
  if (!_root) _root = findProjectRoot();
  return _root;
}

/** @internal — test-only helper to override cached root */
export function _setRootForTesting(dir: string | null): void {
  _root = dir;
}

export const paths = {
  get root() {
    return root();
  },
  get appDir() {
    return join(root(), "app");
  },
  get componentDir() {
    return join(root(), "component");
  },
  get connectionDir() {
    return join(root(), "connection");
  },
  get dockerDir() {
    return join(root(), "docker");
  },
  get migrationsDir() {
    return join(root(), "app", "drizzle", "migrations");
  },
  get journalPath() {
    return join(
      root(),
      "app",
      "drizzle",
      "migrations",
      "meta",
      "_journal.json",
    );
  },
  get envFile() {
    return join(root(), "app", ".env.local");
  },
  get envExample() {
    return join(root(), ".env.example");
  },
  get projectConfig() {
    return join(root(), "neoboard.config.json");
  },
  get localConfig() {
    return join(root(), ".neoboard.local");
  },
};

// Config defaults
const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  ports: { app: 3000, postgres: 5432, neo4j_http: 7474, neo4j_bolt: 7687 },
  postgres: { user: "neoboard", password: "neoboard", database: "neoboard" }, // NOSONAR — dev-only defaults, not production credentials
  neo4j: { user: "neo4j", password: "neoboard123" }, // NOSONAR — dev-only defaults, not production credentials
  seed: {
    script: "scripts/seed-demo.mjs",
    neo4j_cypher: "docker/neo4j/init.cypher",
  },
};

const DEFAULT_LOCAL_CONFIG: LocalConfig = { mode: "docker" };

// Read/write functions
export function readProjectConfig(): ProjectConfig {
  if (!existsSync(paths.projectConfig)) return DEFAULT_PROJECT_CONFIG;
  try {
    return JSON.parse(readFileSync(paths.projectConfig, "utf-8"));
  } catch {
    return DEFAULT_PROJECT_CONFIG;
  }
}

export function readLocalConfig(): LocalConfig {
  if (!existsSync(paths.localConfig)) return DEFAULT_LOCAL_CONFIG;
  try {
    return JSON.parse(readFileSync(paths.localConfig, "utf-8"));
  } catch {
    return DEFAULT_LOCAL_CONFIG;
  }
}

export function writeLocalConfig(config: LocalConfig): void {
  writeFileSync(paths.localConfig, JSON.stringify(config, null, 2) + "\n");
}

export function getMode(): "docker" | "local" {
  return readLocalConfig().mode;
}
