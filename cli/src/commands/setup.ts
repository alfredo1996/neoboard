import { runInit } from "./init.js";
import { runStart } from "./start.js";
import { success } from "../lib/output.js";

/**
 * Returns true only when every start step actually succeeded, so callers
 * (e.g. `neoboard demo`) can abort instead of seeding against a stack
 * that never came up.
 */
export async function runSetup(opts?: {
  mode?: "docker" | "local";
  /** Start the full stack (app + DBs) or just DBs? */
  full?: boolean;
}): Promise<boolean> {
  await runInit(opts);
  const started = await runStart({ full: opts?.full });
  if (!started) return false;
  success("Setup complete!");
  return true;
}
