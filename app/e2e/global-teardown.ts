import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const STATE_FILE = path.join(__dirname, ".containers-state.json");
const ENV_FILE = path.join(__dirname, "..", ".env.test");
const ENV_LOCAL = path.join(__dirname, "..", ".env.local");
const ENV_LOCAL_BAK = path.join(__dirname, "..", ".env.local.bak");

export default async function globalTeardown() {
  console.log("\n🧹 Stopping test containers...\n");

  // Restore original .env.local from backup.
  // Fallback: if no backup exists (e.g. previous crash deleted it), copy from
  // .env (version-controlled source of truth) so the dev server always works.
  const ENV_BASE = path.join(__dirname, "..", ".env");
  if (fs.existsSync(ENV_LOCAL_BAK)) {
    fs.copyFileSync(ENV_LOCAL_BAK, ENV_LOCAL);
    fs.unlinkSync(ENV_LOCAL_BAK);
    console.log("📦 Restored .env.local from backup");
  } else if (fs.existsSync(ENV_BASE)) {
    fs.copyFileSync(ENV_BASE, ENV_LOCAL);
    console.log("📦 Restored .env.local from .env (no backup found)");
  }

  if (!fs.existsSync(STATE_FILE)) {
    console.log("No container state file found, nothing to clean up.");
    return;
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as {
    pgContainerId: string;
    neo4jContainerId: string;
  };

  for (const [name, id] of Object.entries(state)) {
    try {
      execSync(`docker rm -f ${id}`, { stdio: "pipe" });
      console.log(`✅ Removed ${name}: ${id.slice(0, 12)}`);
    } catch {
      // Container may already be gone
      console.log(`⚠️ ${name} (${id.slice(0, 12)}) already removed`);
    }
  }

  // Clean up temp files
  try { fs.unlinkSync(STATE_FILE); } catch {}
  try { fs.unlinkSync(ENV_FILE); } catch {}

  console.log("✅ Cleanup complete.\n");
}
