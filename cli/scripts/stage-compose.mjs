#!/usr/bin/env node
/**
 * Copy the compose files the standalone CLI needs into the package directory,
 * so `npm pack` can include them.
 *
 * npm's `files` is resolved relative to the PACKAGE root, and `docker/` lives
 * at the REPO root — one level up. Listing "docker" in `files` therefore does
 * nothing at all, silently: `npm pack` succeeds, ships no compose file, and a
 * manifest-only test asserting `files.includes("docker")` passes while proving
 * nothing. That is how #1315's second half would have shipped twice.
 *
 * Run by `prepack` (after the build — a package without dist/ is as broken as
 * one without compose files, and prepack is the hook that guarantees BOTH for
 * anyone who packs, not just for the release workflow which happens to build
 * first). `--clean`, from `postpack`, removes the staged copy.
 *
 * Both paths are computed from import.meta.url, never from cwd. A bare
 * `rm -rf docker` in postpack would be relative to whatever directory npm
 * happened to run it from — and one level up is the repo's real docker/.
 * `cli/docker/` is gitignored.
 */
import { mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoDocker = join(dirname(cliDir), "docker");
const dest = join(cliDir, "docker");

// Only what a standalone install can actually use. prod-full pulls
// ghcr.io/... rather than building from source, which a standalone user has
// none of; the dev compose files reference build contexts that will not exist.
const FILES = [
  "docker-compose.prod-full.yml",
  "docker-compose.prod.yml",
  "neo4j/init.cypher",
  "postgres/init.sql",
];

rmSync(dest, { recursive: true, force: true });

if (process.argv.includes("--clean")) {
  console.error("removed staged cli/docker/");
  process.exit(0);
}

for (const rel of FILES) {
  const to = join(dest, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(repoDocker, rel), to);
}
// stderr, not stdout: prepack output is interleaved with `npm pack --json`,
// and a stray line there makes the JSON unparseable for every consumer.
console.error(`staged ${FILES.length} compose assets into cli/docker/`);
