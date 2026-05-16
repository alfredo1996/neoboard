import { join } from "node:path";
import { findProjectRoot } from "../lib/config.js";
import { run } from "../lib/exec.js";
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
} from "../lib/manifest.js";
import { validatePluginExport } from "../lib/plugin-validator.js";

const PLUGINS_MANIFEST = "neoboard-plugins.json";
const CONNECTORS_MANIFEST = "neoboard-connectors.json";

/**
 * Install an npm package, validate it as a NeoBoard plugin, and register it.
 */
export async function runPluginAdd(
  packageName: string,
  opts?: { override?: boolean; export?: string },
): Promise<void> {
  const root = findProjectRoot();
  const overrides = opts?.override ?? false;
  const exportName = opts?.export ?? "default";

  // 1. Install the package
  const spinner = createSpinner("Installing " + packageName + "...");
  spinner.start();
  try {
    run("npm install " + packageName, { cwd: root });
    spinner.succeed("Installed " + packageName);
  } catch (err) {
    spinner.fail("Failed to install " + packageName);
    logError(String(err));
    process.exitCode = 1;
    return;
  }

  // 2. Try to load and validate the export
  let exported: unknown;
  try {
    const mod = await import(packageName);
    exported =
      exportName === "default" ? (mod.default ?? mod) : mod[exportName];
  } catch (err) {
    logError("Failed to import " + packageName + ": " + String(err));
    rollback(packageName, root);
    return;
  }

  if (!exported) {
    logError(
      'Package "' +
        packageName +
        '" has no ' +
        (exportName === "default" ? "default" : '"' + exportName + '"') +
        " export.",
    );
    rollback(packageName, root);
    return;
  }

  const validation = validatePluginExport(exported);
  if (!validation.valid) {
    logError('Package "' + packageName + '" is not a valid NeoBoard plugin:');
    for (const e of validation.errors) {
      logError("  - " + e);
    }
    rollback(packageName, root);
    return;
  }

  const pluginType = validation.pluginType!;
  const obj = exported as Record<string, unknown>;
  const pluginLabel = String(obj.type);

  // 3. Register in the appropriate manifest
  const manifestFile =
    pluginType === "chart" ? PLUGINS_MANIFEST : CONNECTORS_MANIFEST;
  const manifestKey = pluginType === "chart" ? "plugins" : "connectors";
  const manifestPath = join(root, manifestFile);

  const entry = {
    package: packageName,
    ...(exportName !== "default" ? { export: exportName } : {}),
    ...(overrides ? { overrides: true } : {}),
  };

  const added = addToManifest(
    manifestPath,
    manifestKey as "plugins" | "connectors",
    entry,
  );
  if (!added) {
    warn(
      packageName + " is already registered in " + manifestFile + ". Skipping.",
    );
  }

  // 4. Run codegen
  const codegenScript =
    pluginType === "chart"
      ? "scripts/generate-plugin-imports.mjs"
      : "scripts/generate-connector-imports.mjs";

  try {
    run("node " + codegenScript, { cwd: root });
  } catch {
    warn("Codegen script failed. Run manually: node " + codegenScript);
  }

  success(
    'Plugin "' +
      pluginLabel +
      '" registered as ' +
      pluginType +
      " in " +
      manifestFile,
  );
}

/**
 * List all registered plugins (built-in chart types + external from manifests).
 */
export function runPluginList(): void {
  const root = findProjectRoot();

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
    "treemap",
    "gantt",
    "circle-packing",
    "choropleth",
  ];

  const builtInConnectors = ["neo4j", "postgresql"];

  const externalCharts = readManifest(join(root, PLUGINS_MANIFEST), "plugins");
  const externalConnectors = readManifest(
    join(root, CONNECTORS_MANIFEST),
    "connectors",
  );

  info(
    "Charts (" +
      builtInCharts.length +
      " built-in, " +
      externalCharts.length +
      " external):",
  );
  for (const type of builtInCharts) {
    console.log("  " + type.padEnd(20) + "built-in");
  }
  for (const ext of externalCharts) {
    console.log(
      "  " +
        ext.package.padEnd(20) +
        "external" +
        (ext.overrides ? "  (overrides)" : ""),
    );
  }

  console.log("");
  info(
    "Connectors (" +
      builtInConnectors.length +
      " built-in, " +
      externalConnectors.length +
      " external):",
  );
  for (const type of builtInConnectors) {
    console.log("  " + type.padEnd(20) + "built-in");
  }
  for (const ext of externalConnectors) {
    console.log(
      "  " +
        ext.package.padEnd(20) +
        "external" +
        (ext.overrides ? "  (overrides)" : ""),
    );
  }
}

/**
 * Remove an external plugin by package name and uninstall it.
 */
export async function runPluginRemove(packageName: string): Promise<void> {
  const root = findProjectRoot();

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
  const codegenScript =
    manifestType === "chart"
      ? "scripts/generate-plugin-imports.mjs"
      : "scripts/generate-connector-imports.mjs";

  try {
    run("node " + codegenScript, { cwd: root });
  } catch {
    warn("Codegen script failed. Run manually: node " + codegenScript);
  }

  // Uninstall the package
  try {
    run("npm uninstall " + packageName, { cwd: root });
  } catch {
    warn("npm uninstall failed. Run manually: npm uninstall " + packageName);
  }

  success('Plugin "' + packageName + '" removed');
}

function rollback(packageName: string, root: string): void {
  warn("Rolling back: uninstalling " + packageName);
  try {
    run("npm uninstall " + packageName, { cwd: root });
  } catch {
    // best effort
  }
  process.exitCode = 1;
}
