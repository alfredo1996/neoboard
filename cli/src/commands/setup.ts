import { runInit } from "./init.js";
import { runStart } from "./start.js";
import { success } from "../lib/output.js";

export async function runSetup(opts?: {
  mode?: "docker" | "local";
}): Promise<void> {
  await runInit(opts);
  await runStart();
  success("Setup complete!");
}
