import { runInit } from "./init.js";
import { runStart } from "./start.js";
import { success } from "../lib/output.js";

export async function runSetup(opts?: {
  mode?: "docker" | "local";
  /** Start the full stack (app + DBs) or just DBs? */
  full?: boolean;
}): Promise<void> {
  await runInit(opts);
  await runStart({ full: opts?.full });
  success("Setup complete!");
}
