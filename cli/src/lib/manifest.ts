/**
 * Read/write helpers for neoboard-plugins.json and neoboard-connectors.json.
 *
 * Writes use atomic temp-file + rename to prevent corruption from
 * concurrent processes or crashes mid-write.
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface ManifestEntry {
  package: string;
  export?: string;
  overrides?: boolean;
}

type ManifestKey = "plugins" | "connectors";

/**
 * Atomically write JSON to a file: write to temp file, then rename.
 * Rename is atomic on POSIX and near-atomic on Windows.
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = join(
    dirname(filePath),
    ".tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n");
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Read entries from a manifest file. Returns empty array if file missing
 * or corrupted (with a warning for corruption).
 */
export function readManifest(
  filePath: string,
  key: ManifestKey,
): ManifestEntry[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return Array.isArray(raw[key]) ? raw[key] : [];
  } catch (err) {
    console.warn("Failed to parse manifest " + filePath + ":", err);
    return [];
  }
}

/**
 * Add an entry to a manifest file. Creates the file if missing.
 * Skips if the package is already registered.
 */
export function addToManifest(
  filePath: string,
  key: ManifestKey,
  entry: ManifestEntry,
): boolean {
  const entries = readManifest(filePath, key);
  if (entries.some((e) => e.package === entry.package)) {
    return false; // already exists
  }
  entries.push(entry);
  atomicWriteJson(filePath, { [key]: entries });
  return true;
}

/**
 * Remove an entry from a manifest file by package name.
 * Returns true if the entry was found and removed.
 */
export function removeFromManifest(
  filePath: string,
  key: ManifestKey,
  packageName: string,
): boolean {
  if (!existsSync(filePath)) return false;
  const entries = readManifest(filePath, key);
  const filtered = entries.filter((e) => e.package !== packageName);
  if (filtered.length === entries.length) return false; // not found
  atomicWriteJson(filePath, { [key]: filtered });
  return true;
}
