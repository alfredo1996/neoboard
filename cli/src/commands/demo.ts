import { runSetup } from "./setup.js";
import { runDbSeed } from "./db/seed.js";
import { success, banner } from "../lib/output.js";

export async function runDemo(opts?: {
  mode?: "docker" | "local";
}): Promise<void> {
  // Demo always starts the full stack (app + DBs in Docker)
  await runSetup({ ...opts, full: true });
  await runDbSeed({ neo4j: true, demo: true, dockerNetwork: true });

  banner([
    "Demo environment ready!",
    "",
    "Login credentials:",
    "  Email:    alice@example.com",
    "  Password: password123",
    "",
    "Other demo users: bob, carol, dave @example.com",
  ]);
  success("Open http://localhost:3000 to get started");
}
