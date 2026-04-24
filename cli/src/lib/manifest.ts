/**
 * Read/write helpers for neoboard-plugins.json and neoboard-connectors.json.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

export interface ManifestEntry {
  package: string;
  export?: string;
  overrides?: boolean;
}

type ManifestKey = "plugins" | "connectors";

/**
 * Read entries from a manifest file. Returns empty array if file missing.
 */
export function readManifest(
  filePath: string,
  key: ManifestKey,
): ManifestEntry[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return Array.isArray(raw[key]) ? raw[key] : [];
  } catch {
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
  writeFileSync(filePath, JSON.stringify({ [key]: entries }, null, 2) + "\n");
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
  writeFileSync(filePath, JSON.stringify({ [key]: filtered }, null, 2) + "\n");
  return true;
}
