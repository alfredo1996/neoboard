import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

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
/**
 * Walk up looking for the monorepo root. Returns null when there isn't one.
 *
 * Returns rather than throws (#1315): under `npx @neoboard/cli`, the CLI lives
 * in an npm cache directory with no `neoboard` package.json above it, and a
 * throw this deep in a path helper surfaced as an unrelated-looking crash —
 * `setup` died in root detection, reporting nothing about standalone mode.
 * The caller is the only place that knows whether the absence is a problem.
 */
export function findProjectRoot(startDir?: string): string | null {
  let dir = startDir ?? dirname(fileURLToPath(import.meta.url));
  // Terminate when dirname stops changing — "/" on POSIX, "C:\\" on Windows.
  // The old `while (dir !== "/")` looped forever on Windows (#991).
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "neoboard") return dir;
      } catch {
        /* skip */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * The directory the CLI operates on, in either situation:
 *
 *   inside the monorepo   the checkout root (contributors) — always wins, so a
 *                         stray NEOBOARD_DIR cannot silently redirect a
 *                         contributor's checkout somewhere else
 *   installed standalone  a working directory: $NEOBOARD_DIR, else
 *                         ./neoboard under the current directory
 *
 * Created if missing — a standalone user has nowhere to put config, .env or
 * generated secrets otherwise.
 */
export function resolveRoot(startDir?: string): string {
  const monorepo = findCheckout(startDir);
  if (monorepo) return monorepo;

  const dir = process.env.NEOBOARD_DIR || join(process.cwd(), "neoboard");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Abort with an explanation when a command genuinely needs the source tree.
 *
 * `dev`, `db seed` and the plugin commands run scripts that only exist in a
 * checkout, and scripts/ is deliberately not shipped in the published package.
 * Without this they fail on a missing file deep inside the command, which
 * reads as a bug rather than as "this command is not for this install".
 */
export function assertCheckout(command: string, startDir?: string): void {
  if (!isStandalone(startDir)) return;
  throw new Error(
    `\`neoboard ${command}\` needs the NeoBoard source tree, and this is a ` +
      `standalone install (no checkout found).\n\n` +
      `Clone the repo and run it from there:\n` +
      `  git clone https://github.com/alfredo1996/neoboard.git\n` +
      `  cd neoboard && npm install\n\n` +
      `Everything that manages a running instance — setup, start, stop, ` +
      `status, doctor, logs, config, env — works standalone.`,
  );
}

/** True when there is no monorepo checkout — i.e. an npx/global install. */
export function isStandalone(startDir?: string): boolean {
  return findCheckout(startDir) === null;
}

/**
 * Look for a checkout from where the user is STANDING first, then from where
 * the CLI is installed.
 *
 * cwd matters because a globally installed or npx'd CLI run from inside a
 * checkout should use that checkout — otherwise `neoboard dev` would refuse,
 * and `config list` would create ./neoboard inside the user's own source tree,
 * with the repo right there. The module path is the fallback that covers the
 * monorepo's own `node cli/dist/index.js` from an unrelated directory.
 */
function findCheckout(startDir?: string): string | null {
  if (startDir !== undefined) return findProjectRoot(startDir);
  return findProjectRoot(process.cwd()) ?? findProjectRoot();
}

// Path constants (lazy-initialized)
let _root: string | null = null;
function root(): string {
  if (!_root) _root = resolveRoot();
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

export function writeProjectConfig(config: ProjectConfig): void {
  writeFileSync(paths.projectConfig, JSON.stringify(config, null, 2) + "\n");
}

export function writeLocalConfig(config: LocalConfig): void {
  writeFileSync(paths.localConfig, JSON.stringify(config, null, 2) + "\n");
}

export function getMode(): "docker" | "local" {
  return readLocalConfig().mode;
}
