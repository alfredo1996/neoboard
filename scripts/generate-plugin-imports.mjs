#!/usr/bin/env node
/**
 * Generate app/src/plugins/external-plugins.generated.ts from
 * neoboard-plugins.json.
 *
 * Runs as predev and prebuild. Reads the manifest at the repo root,
 * validates each entry, and emits a TypeScript module that the plugin
 * bootstrap imports. All resolution happens at build time so the
 * webpack graph stays static — no runtime dynamic imports.
 *
 * Exit code 1 on:
 *   - manifest missing / unparseable
 *   - entries fail shape validation
 *   - duplicate package+export pairs
 *
 * Idempotent: writes the output file only when its contents would
 * change, so downstream tools that watch mtimes don't trigger spuriously.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(REPO_ROOT, "neoboard-plugins.json");
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  "app",
  "src",
  "plugins",
  "external-plugins.generated.ts",
);

/**
 * Validate a manifest entry. Returns an error message or null.
 * Kept in sync with neoboard-plugins.schema.json.
 *
 * @param {unknown} entry
 * @param {number} index
 * @returns {string | null}
 */
export function validateEntry(entry, index) {
  if (typeof entry !== "object" || entry === null) {
    return `plugins[${index}] must be an object`;
  }
  const e = /** @type {Record<string, unknown>} */ (entry);
  if (typeof e.package !== "string" || e.package.trim() === "") {
    return `plugins[${index}].package must be a non-empty string`;
  }
  if (/[\s"'\\]/.test(e.package)) {
    return `plugins[${index}].package must not contain whitespace, quotes, or backslashes`;
  }
  if (
    e.export !== undefined &&
    (typeof e.export !== "string" || e.export.trim() === "")
  ) {
    return `plugins[${index}].export must be a non-empty string when provided`;
  }
  if (
    e.export !== undefined &&
    e.export !== "default" &&
    !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(e.export)
  ) {
    return `plugins[${index}].export must be a valid JavaScript identifier`;
  }
  if (e.overrides !== undefined && typeof e.overrides !== "boolean") {
    return `plugins[${index}].overrides must be a boolean when provided`;
  }
  const allowed = new Set(["package", "export", "overrides"]);
  for (const key of Object.keys(e)) {
    if (!allowed.has(key)) {
      return `plugins[${index}] has unknown key "${key}"`;
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
  if (!Array.isArray(m.plugins)) {
    return { errors: ["manifest.plugins must be an array"], entries: [] };
  }

  const entries = [];
  const seen = new Set();
  for (let i = 0; i < m.plugins.length; i++) {
    const err = validateEntry(m.plugins[i], i);
    if (err) {
      errors.push(err);
      continue;
    }
    const e = /** @type {Record<string, unknown>} */ (m.plugins[i]);
    const normalized = {
      package: /** @type {string} */ (e.package),
      export: typeof e.export === "string" ? e.export : "default",
      overrides: e.overrides === true,
    };
    const key = `${normalized.package}::${normalized.export}`;
    if (seen.has(key)) {
      errors.push(
        `plugins[${i}]: duplicate entry for "${normalized.package}" export "${normalized.export}"`,
      );
      continue;
    }
    seen.add(key);
    entries.push(normalized);
  }
  return { errors, entries };
}

/**
 * Generate the TypeScript source for external-plugins.generated.ts.
 *
 * @param {Array<{ package: string; export: string; overrides: boolean }>} entries
 * @returns {string}
 */
export function renderSource(entries) {
  const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: neoboard-plugins.json
 * Regenerate: node scripts/generate-plugin-imports.mjs
 */
import type { ChartPlugin } from "@/lib/plugin/chart-plugin-registry";
`;

  if (entries.length === 0) {
    return `${header}
export interface ExternalPluginEntry {
  plugin: ChartPlugin;
  overrides: boolean;
}

export const EXTERNAL_PLUGINS: ExternalPluginEntry[] = [];
`;
  }

  const imports = entries
    .map((e, i) => {
      const alias = `externalPlugin${i}`;
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
        `  { plugin: externalPlugin${i}, overrides: ${e.overrides} }, // ${e.package} (${e.export})`,
    )
    .join("\n");

  return `${header}
${imports}

export interface ExternalPluginEntry {
  plugin: ChartPlugin;
  overrides: boolean;
}

export const EXTERNAL_PLUGINS: ExternalPluginEntry[] = [
${arrayEntries}
];
`;
}

/**
 * Run the generator. Returns an exit-code-ish result for testing.
 * CLI wrapper below calls `process.exit` on failure.
 *
 * @param {object} [opts]
 * @param {string} [opts.manifestPath]
 * @param {string} [opts.outputPath]
 * @returns {{ ok: boolean; errors: string[]; wrote: boolean }}
 */
export function runGenerator(opts = {}) {
  const manifestPath = opts.manifestPath ?? MANIFEST_PATH;
  const outputPath = opts.outputPath ?? OUTPUT_PATH;

  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      errors: [`Manifest not found at ${manifestPath}`],
      wrote: false,
    };
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
      wrote: false,
    };
  }

  const { errors, entries } = validateManifest(raw);
  if (errors.length > 0) {
    return { ok: false, errors, wrote: false };
  }

  // Verify that all referenced packages are actually installed
  for (const entry of entries) {
    try {
      import.meta.resolve?.(entry.package);
    } catch {
      // Fallback: try require.resolve via createRequire
      try {
        const { createRequire } = await import("node:module");
        const require = createRequire(manifestPath);
        require.resolve(entry.package);
      } catch {
        errors.push(
          `Package "${entry.package}" is not installed. Run: npm install ${entry.package}`,
        );
      }
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, wrote: false };
  }

  const source = renderSource(entries);

  // Idempotent write — skip if content matches (preserves mtime for
  // watchers that care).
  const existing = existsSync(outputPath)
    ? readFileSync(outputPath, "utf8")
    : null;
  if (existing === source) {
    return { ok: true, errors: [], wrote: false };
  }

  writeFileSync(outputPath, source, "utf8");
  return { ok: true, errors: [], wrote: true };
}

// ---------------------------------------------------------------------------
// CLI entry — only runs when invoked directly (not when imported by tests).
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const result = runGenerator();
  if (!result.ok) {
    console.error("neoboard-plugins.json validation failed:");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (result.wrote) {
    console.log(
      `Generated ${OUTPUT_PATH.replace(REPO_ROOT + "/", "")} from manifest`,
    );
  }
}
