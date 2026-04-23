#!/usr/bin/env node
/**
 * NeoBoard Journey Recorder
 *
 * Launches a headed Chromium browser with video recording enabled,
 * runs each journey script, and saves the resulting .webm files
 * to the `videos/` directory at the repo root.
 *
 * Usage:
 *   node scripts/record-journeys/record.mjs              # record all
 *   node scripts/record-journeys/record.mjs 01-sign-in   # record one
 *   node scripts/record-journeys/record.mjs --list        # list available
 *
 * Requirements:
 *   - Docker demo environment running (neoboard demo)
 *   - npx playwright install chromium
 */

import { chromium } from "playwright";
import { readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOURNEYS_DIR = resolve(__dirname, "journeys");
const VIDEOS_DIR = resolve(__dirname, "..", "..", "videos");
const VIEWPORT = { width: 1280, height: 720 };
const APP_URL = "http://localhost:3000";

/**
 * Discover all journey modules in the journeys/ directory.
 * Returns sorted by filename (01-, 02-, etc.).
 */
function discoverJourneys() {
  return readdirSync(JOURNEYS_DIR)
    .filter((f) => f.endsWith(".mjs"))
    .sort()
    .map((f) => ({
      file: f,
      slug: f.replace(/\.mjs$/, ""),
      path: resolve(JOURNEYS_DIR, f),
    }));
}

async function recordJourney(journey) {
  const mod = await import(journey.path);
  const title = mod.title ?? journey.slug;

  console.log(`\n  Recording: ${title} (${journey.file})`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: VIDEOS_DIR,
      size: VIEWPORT,
    },
    colorScheme: "light",
  });

  const page = await context.newPage();

  try {
    // Verify the app is reachable
    const probe = await page.goto(APP_URL, { timeout: 10_000 }).catch(() => null);
    if (!probe || !probe.ok()) {
      console.error(`    App not reachable at ${APP_URL} — is Docker running?`);
      await context.close();
      await browser.close();
      return null;
    }

    await mod.run(page);

    // Close context to finalize the video file
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();

    if (videoPath) {
      // Rename from Playwright's random UUID to the journey slug
      const { renameSync } = await import("node:fs");
      const ext = videoPath.endsWith(".webm") ? ".webm" : ".mp4";
      const dest = resolve(VIDEOS_DIR, `${journey.slug}${ext}`);
      try {
        renameSync(videoPath, dest);
        console.log(`    Saved: ${dest.replace(resolve(__dirname, "../..") + "/", "")}`);
        return dest;
      } catch {
        console.log(`    Saved: ${videoPath}`);
        return videoPath;
      }
    }
    return null;
  } catch (err) {
    console.error(`    Failed: ${err.message}`);
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--list") || args.includes("-l")) {
  const journeys = discoverJourneys();
  console.log("Available journeys:\n");
  for (const j of journeys) {
    console.log(`  ${j.slug}`);
  }
  process.exit(0);
}

const allJourneys = discoverJourneys();
const filter = args.filter((a) => !a.startsWith("-"));
const selected =
  filter.length > 0
    ? allJourneys.filter((j) => filter.some((f) => j.slug.includes(f)))
    : allJourneys;

if (selected.length === 0) {
  console.error("No matching journeys found.");
  console.error("Available:", allJourneys.map((j) => j.slug).join(", "));
  process.exit(1);
}

console.log(`\nNeoBoard Journey Recorder`);
console.log(`Recording ${selected.length} journey(s)...\n`);

const results = [];
for (const journey of selected) {
  const result = await recordJourney(journey);
  results.push({ journey: journey.slug, video: result });
}

console.log("\n--- Results ---");
for (const r of results) {
  const status = r.video ? "OK" : "FAILED";
  console.log(`  ${status}  ${r.journey}`);
}

const failed = results.filter((r) => !r.video).length;
if (failed > 0) {
  console.log(`\n${failed} journey(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} video(s) saved to videos/`);
