import { runSetup } from "./setup.js";
import { runDbSeed } from "./db/seed.js";
import { success, banner } from "../lib/output.js";

export async function runDemo(opts?: {
  mode?: "docker" | "local";
}): Promise<void> {
  await runSetup(opts);
  await runDbSeed({ neo4j: true, demo: true });

  banner([
    "Demo environment ready!",
    "",
    "Login credentials:",
    "  Email:    admin@neoboard.local",
    "  Password: admin123",
  ]);
  success("Open http://localhost:3000 to get started");
}
