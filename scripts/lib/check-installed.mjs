import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The installed check both codegens run on their manifest (#2064, #2087).
 *
 * The generated files import each package as an ES module, so resolve the way
 * that import does: a CommonJS resolve misses an exports map with only an
 * `import` condition, the layout the SDK itself ships. `resolve` is the
 * caller's own `import.meta.resolve`, so an entry resolves from the codegen as
 * it always has. It returns a URL rather than throwing when the target file is
 * missing (a path entry, an unbuilt dist), so confirm the file exists.
 *
 * @param {Array<{ package: string }>} entries
 * @param {(specifier: string) => string} resolve
 * @returns {string[]} one error per entry whose package is not installed
 */
export function checkInstalled(entries, resolve) {
  return entries
    .map((entry) => entry.package)
    .filter((name) => !isInstalled(name, resolve))
    .map(
      (name) => `Package "${name}" is not installed. Run: npm install ${name}`,
    );
}

function isInstalled(name, resolve) {
  try {
    const url = resolve(name);
    return !url.startsWith("file:") || existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}
