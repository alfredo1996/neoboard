#!/usr/bin/env node
/**
 * Generate connection/src/external-connectors.generated.ts from
 * neoboard-connectors.json, and beside it server-external-packages.generated.json:
 * the packages the server loads from node_modules instead of bundling, which
 * each connector declares as `neoboard.serverExternalPackages` in its
 * package.json (the built-ins in connection's). next.config.ts reads it (#2067).
 *
 * Mirrors the chart plugin codegen (generate-plugin-imports.mjs) but
 * targets the connection package instead of the app package.
 *
 * Runs as connection's prebuild, so every build of connection regenerates it
 * first. App's predev and prebuild build connection, so every path that serves
 * or builds the app does too: root dev and build, neoboard dev, the Docker
 * build stage and E2E global setup (#2062).
 *
 * Exit code 1 on:
 *   - manifest unparseable
 *   - entries fail shape validation
 *   - duplicate package+export pairs
 *   - a serverExternalPackages declaration that is not a list of package names
 *
 * Idempotent: writes the output file only when its contents would
 * change, so downstream tools that watch mtimes don't trigger spuriously.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkInstalled } from "./lib/check-installed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(REPO_ROOT, "neoboard-connectors.json");
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  "connection",
  "src",
  "external-connectors.generated.ts",
);
const EXTERNALS_PATH = resolve(
  REPO_ROOT,
  "connection",
  "src",
  "server-external-packages.generated.json",
);
const CONNECTION_PACKAGE = resolve(REPO_ROOT, "connection", "package.json");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/**
 * The package.json of an installed connector: the nearest one with a name up
 * from the file its entry resolves to, so a subpath entry or an exports map
 * that hides package.json does not matter. null when there is none.
 *
 * @param {string} entry
 */
function installedPackageJson(entry) {
  const url = import.meta.resolve(entry);
  if (!url.startsWith("file:")) return null;
  for (let dir = dirname(fileURLToPath(url)); ; dir = dirname(dir)) {
    const file = join(dir, "package.json");
    const pkg = existsSync(file) ? readJson(file) : {};
    if (pkg.name) return pkg;
    if (dir === dirname(dir)) return null;
  }
}

/**
 * Every declared server-external package, once each, in declaration order.
 *
 * @param {Array<{ name: string; pkg: { neoboard?: { serverExternalPackages?: unknown } } | null }>} declarers
 * @returns {{ errors: string[]; packages: string[] }}
 */
function collectServerExternals(declarers) {
  const errors = [];
  const packages = new Set();
  for (const { name, pkg } of declarers) {
    if (!pkg) {
      errors.push(`${name}: no package.json found for its installed package`);
      continue;
    }
    const list = pkg.neoboard?.serverExternalPackages ?? [];
    if (
      Array.isArray(list) &&
      list.every((p) => typeof p === "string" && /^[^\s"'\\]+$/.test(p))
    ) {
      list.forEach((p) => packages.add(p));
    } else {
      errors.push(
        `${name}: neoboard.serverExternalPackages must be an array of package names`,
      );
    }
  }
  return { errors, packages: [...packages] };
}

/** Write `source` to `path` unless it already holds it. Returns whether it wrote. */
function writeIfChanged(path, source) {
  if (existsSync(path) && readFileSync(path, "utf8") === source) return false;
  writeFileSync(path, source, "utf8");
  return true;
}

/**
 * Validate a manifest entry. Returns an error message or null.
 *
 * @param {unknown} entry
 * @param {number} index
 * @returns {string | null}
 */
export function validateEntry(entry, index) {
  if (typeof entry !== "object" || entry === null) {
    return `connectors[${index}] must be an object`;
  }
  const e = /** @type {Record<string, unknown>} */ (entry);
  if (typeof e.package !== "string" || e.package.trim() === "") {
    return `connectors[${index}].package must be a non-empty string`;
  }
  if (/[\s"'\\]/.test(e.package)) {
    return `connectors[${index}].package must not contain whitespace, quotes, or backslashes`;
  }
  if (
    e.export !== undefined &&
    (typeof e.export !== "string" || e.export.trim() === "")
  ) {
    return `connectors[${index}].export must be a non-empty string when provided`;
  }
  if (
    e.export !== undefined &&
    e.export !== "default" &&
    !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(e.export)
  ) {
    return `connectors[${index}].export must be a valid JavaScript identifier`;
  }
  if (e.overrides !== undefined && typeof e.overrides !== "boolean") {
    return `connectors[${index}].overrides must be a boolean when provided`;
  }
  const allowed = new Set(["package", "export", "overrides"]);
  for (const key of Object.keys(e)) {
    if (!allowed.has(key)) {
      return `connectors[${index}] has unknown key "${key}"`;
    }
  }
  return null;
}

/**
 * Validate the full manifest. Returns an array of error messages
 * (empty when valid).
 *
 * @param {unknown} raw
 * @returns {{ errors: string[]; entries: Array<{ package: string; export: string; overrides: boolean }> }}
 */
export function validateManifest(raw) {
  const errors = [];
  if (typeof raw !== "object" || raw === null) {
    return { errors: ["manifest must be a JSON object"], entries: [] };
  }
  const m = /** @type {Record<string, unknown>} */ (raw);
  if (!Array.isArray(m.connectors)) {
    return { errors: ["manifest.connectors must be an array"], entries: [] };
  }

  const entries = [];
  const seen = new Set();
  for (let i = 0; i < m.connectors.length; i++) {
    const err = validateEntry(m.connectors[i], i);
    if (err) {
      errors.push(err);
      continue;
    }
    const e = /** @type {Record<string, unknown>} */ (m.connectors[i]);
    const normalized = {
      package: /** @type {string} */ (e.package),
      export: typeof e.export === "string" ? e.export : "default",
      overrides: e.overrides === true,
    };
    const key = `${normalized.package}::${normalized.export}`;
    if (seen.has(key)) {
      errors.push(
        `connectors[${i}]: duplicate entry for "${normalized.package}" export "${normalized.export}"`,
      );
      continue;
    }
    seen.add(key);
    entries.push(normalized);
  }
  return { errors, entries };
}

/**
 * Generate the TypeScript source for external-connectors.generated.ts.
 *
 * @param {Array<{ package: string; export: string; overrides: boolean }>} entries
 * @returns {string}
 */
export function renderSource(entries) {
  const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: neoboard-connectors.json
 * Regenerate: node scripts/generate-connector-imports.mjs
 */
import type { ConnectorPlugin } from "@neoboard/connector-sdk";
`;

  if (entries.length === 0) {
    return `${header}
export interface ExternalConnectorEntry {
  plugin: ConnectorPlugin;
  overrides: boolean;
}

export const EXTERNAL_CONNECTORS: ExternalConnectorEntry[] = [];
`;
  }

  const imports = entries
    .map((e, i) => {
      const alias = `externalConnector${i}`;
      const specifier = JSON.stringify(e.package);
      if (e.export === "default") {
        return `import ${alias} from ${specifier};`;
      }
      return `import { ${e.export} as ${alias} } from ${specifier};`;
    })
    .join("\n");

  const arrayEntries = entries
    .map(
      (e, i) =>
        `  { plugin: externalConnector${i}, overrides: ${e.overrides} }, // ${e.package} (${e.export})`,
    )
    .join("\n");

  return `${header}
${imports}

export interface ExternalConnectorEntry {
  plugin: ConnectorPlugin;
  overrides: boolean;
}

export const EXTERNAL_CONNECTORS: ExternalConnectorEntry[] = [
${arrayEntries}
];
`;
}

/**
 * Run the generator.
 *
 * @param {object} [opts]
 * @param {string} [opts.manifestPath]
 * @param {string} [opts.outputPath]
 * @returns {{ ok: boolean; errors: string[]; wrote: boolean }}
 */
export function runGenerator(opts = {}) {
  const manifestPath = opts.manifestPath ?? MANIFEST_PATH;
  const outputPath = opts.outputPath ?? OUTPUT_PATH;

  const { errors, entries } = readManifest(manifestPath);
  // Verify that all referenced packages are actually installed.
  if (errors.length === 0) {
    errors.push(...checkInstalled(entries, import.meta.resolve));
  }
  if (errors.length > 0) {
    return { ok: false, errors, wrote: false };
  }

  const externals = collectServerExternals([
    { name: "connection", pkg: readJson(CONNECTION_PACKAGE) },
    ...entries.map((e) => ({
      name: e.package,
      pkg: installedPackageJson(e.package),
    })),
  ]);
  if (externals.errors.length > 0) {
    return { ok: false, errors: externals.errors, wrote: false };
  }

  const wroteImports = writeIfChanged(outputPath, renderSource(entries));
  const wroteExternals = writeIfChanged(
    EXTERNALS_PATH,
    `${JSON.stringify(externals.packages, null, 2)}\n`,
  );
  return { ok: true, errors: [], wrote: wroteImports || wroteExternals };
}

/**
 * The manifest's validated entries. No manifest means no external connectors.
 *
 * @param {string} path
 */
function readManifest(path) {
  if (!existsSync(path)) return { errors: [], entries: [] };
  try {
    return validateManifest(readJson(path));
  } catch (err) {
    return {
      errors: [
        `Manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
      entries: [],
    };
  }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const result = runGenerator();
  if (!result.ok) {
    console.error("neoboard-connectors.json validation failed:");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (result.wrote) {
    console.log(
      "Generated connection/src/external-connectors.generated.ts and server-external-packages.generated.json from manifest",
    );
  }
}
