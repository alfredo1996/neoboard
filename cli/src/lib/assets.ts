import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The compose files a standalone install starts from (#1314), relative to the
 * docker/ directory. scripts/build-sea.mjs embeds these in the binary and
 * scripts/stage-compose.mjs ships them in the npm package; both read
 * scripts/compose-assets.json, and a test pins this list to it.
 */
export const COMPOSE_ASSETS = [
  "docker-compose.full.yml",
  "postgres/init.sql",
  "neo4j/init.cypher",
] as const;

type SeaModule = { isSea(): boolean; getAsset(k: string, enc: "utf8"): string };

// getBuiltinModule rather than an import: `node:sea` does not exist before
// Node 20.12, and the npm package still runs there.
const seaModule = () =>
  process.getBuiltinModule?.("node:sea") as SeaModule | undefined;

/** True inside the single-file binary, whatever file name it was given. */
export const isSea = (): boolean => seaModule()?.isSea() === true;

/** Inside the single-file binary the files are SEA assets, not on disk. */
function readPackaged(name: string): string {
  if (isSea()) return seaModule()!.getAsset(`docker/${name}`, "utf8");
  // npm: dist/lib/assets.js sits two levels under the package's docker/.
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return readFileSync(join(pkgDir, "docker", name), "utf8");
}

/**
 * Write the packaged compose files into `dockerDir`. Rewritten on every start:
 * they belong to the binary, so an upgraded binary brings its own, and the
 * per-install state lives in docker/.env, which this never touches.
 */
export function stageStandaloneCompose(
  dockerDir: string,
  read: (name: string) => string = readPackaged,
): void {
  for (const name of COMPOSE_ASSETS) {
    const to = join(dockerDir, name);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, read(name));
  }
}
