import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { paths } from "./config.js";

export interface Showcase {
  key: string;
  label: string;
  description: string;
  jsonPath: string;
}

export interface ShowcasesManifest {
  SHOWCASES: Showcase[];
  SHOWCASE_KEYS: Set<string>;
  parseOnlyFlag: (raw: string | undefined) => string[] | undefined;
}

/**
 * Loads the shared showcase manifest at `scripts/demo/showcases.mjs`.
 * Dynamic import so the CLI resolves it at runtime from the project root
 * rather than bundling it. Exposed as its own module so tests can mock it.
 */
export async function loadShowcases(): Promise<ShowcasesManifest> {
  const manifestPath = join(paths.root, "scripts", "demo", "showcases.mjs");
  return (await import(pathToFileURL(manifestPath).href)) as ShowcasesManifest;
}
