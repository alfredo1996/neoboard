import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { finalizeCoverage, loadNextcovConfig } from "nextcov/playwright";

const STATE_FILE = path.join(__dirname, ".containers-state.json");
const SERVER_PID_FILE = path.join(__dirname, ".server-pid");
const ENV_FILE = path.join(__dirname, "..", ".env.test");
const ENV_LOCAL = path.join(__dirname, "..", ".env.local");
const ENV_LOCAL_BAK = path.join(__dirname, "..", ".env.local.bak");

export default async function globalTeardown() {
  // In CI the databases are GitHub Actions service containers — GitHub stops
  // them automatically after the job; we must not try to remove them ourselves.
  const isServiceContainerMode = process.env.CI_SERVICE_CONTAINERS === "true";

  console.log("\n🧹 Stopping test server & containers...\n");

  // ── CI: stop the Next.js server we started in globalSetup ───────────────
  if (fs.existsSync(SERVER_PID_FILE)) {
    const pid = parseInt(fs.readFileSync(SERVER_PID_FILE, "utf-8"), 10);
    try {
      // Kill the detached process group (negative PID kills the group).
      process.kill(-pid, "SIGTERM");
      console.log(`✅ Stopped Next.js server (pid ${pid})`);
    } catch {
      console.log(`⚠️ Next.js server (pid ${pid}) already stopped`);
    }
  }

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

  if (isServiceContainerMode) {
    console.log("CI service containers — skipping docker rm (GitHub manages them).");
  } else {
    if (!fs.existsSync(STATE_FILE)) {
      console.log("No container state file found, nothing to clean up.");
    } else {
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
    }
  }

  // ── Finalize E2E coverage (nextcov) ──────────────────────────────────────
  if (process.env.E2E_COVERAGE) {
    console.log("⏳ Finalizing E2E coverage reports...");
    const nextcovConfig = await loadNextcovConfig(
      path.resolve(__dirname, "..", "playwright.config.ts"),
    );
    await finalizeCoverage(nextcovConfig);
    console.log("✅ E2E coverage reports written");
  }

  // Clean up temp files
  try { fs.unlinkSync(STATE_FILE); } catch {}
  try { fs.unlinkSync(SERVER_PID_FILE); } catch {}
  try { fs.unlinkSync(ENV_FILE); } catch {}

  console.log("✅ Cleanup complete.\n");
}
