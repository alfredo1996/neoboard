#!/usr/bin/env node
/**
 * Build the single-file `neoboard` binary for THIS platform (#1314): bundle the
 * CLI into one CommonJS file, embed the compose files as SEA assets, and inject
 * the blob into a copy of the running Node executable.
 *
 *   node scripts/build-sea.mjs --version 1.9.2 --out dist-sea/neoboard-linux-x64
 *
 * Node SEA needs a single CommonJS entry, and the CLI is ESM with ESM-only
 * dependencies (chalk, ora), so esbuild bundles first. A binary can only be
 * built on its own OS and architecture (the output is a copy of this node), so
 * release.yml runs it once per runner.
 *
 * Run it with an official Node 22 (nvm, actions/setup-node): a distro node
 * built without the SEA fuse cannot take the blob.
 */
import { build } from "esbuild";
import { inject } from "postject";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoDocker = join(dirname(cliDir), "docker");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const version = arg("version");
const out = resolve(arg("out") ?? join(cliDir, "dist-sea", "neoboard"));
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  console.error("usage: build-sea.mjs --version X.Y.Z [--out path]");
  process.exit(2);
}

const work = join(cliDir, "dist-sea", ".work");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(dirname(out), { recursive: true });

// 1. One CommonJS file. import.meta.url (config.ts, index.ts) has no CJS
//    meaning, so it becomes the bundle's own file URL.
const bundle = join(work, "neoboard.cjs");
await build({
  entryPoints: [join(cliDir, "src", "index.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  define: {
    __NEOBOARD_VERSION__: JSON.stringify(version),
    "import.meta.url": "__importMetaUrl",
  },
  banner: {
    js: 'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;',
  },
  logLevel: "warning",
});

// 2. The blob: the bundle plus the compose files the CLI stages at runtime.
const files = JSON.parse(
  readFileSync(join(cliDir, "scripts", "compose-assets.json"), "utf8"),
);
const assets = Object.fromEntries(
  files.map((f) => [`docker/${f}`, join(repoDocker, f)]),
);
const seaConfig = join(work, "sea-config.json");
const blob = join(work, "neoboard.blob");
writeFileSync(
  seaConfig,
  JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    assets,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], {
  stdio: "inherit",
});

// 3. Inject into a copy of this node. macOS wants the signature off before
//    and an ad-hoc one after (an unsigned arm64 binary will not run).
copyFileSync(process.execPath, out);
chmodSync(out, 0o755);
const darwin = process.platform === "darwin";
if (darwin) execFileSync("codesign", ["--remove-signature", out]);
await inject(out, "NODE_SEA_BLOB", readFileSync(blob), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ...(darwin ? { machoSegmentName: "NODE_SEA" } : {}),
});
if (darwin) execFileSync("codesign", ["--sign", "-", out]);
rmSync(work, { recursive: true, force: true });

// 4. It must run, and report the version it was built for.
const reported = execFileSync(out, ["--version"], { encoding: "utf8" }).trim();
if (reported !== version) {
  console.error(`built ${out} reports "${reported}", expected "${version}"`);
  process.exit(1);
}
console.error(`built ${out} (${version})`);
