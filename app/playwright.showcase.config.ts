import { defineConfig, devices } from "@playwright/test";

const serverPort = process.env.TEST_SERVER_PORT || "3100";

/**
 * Records a single continuous walkthrough video of the chart fixes.
 *
 * Not part of CI — `npx playwright test --config playwright.showcase.config.ts`.
 * It reuses the E2E global setup, so it runs against a real production build
 * with the seeded Neo4j movies dataset and Postgres, not mocks.
 *
 * One test, one video file: there is no ffmpeg here to stitch clips together.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/showcase.walkthrough.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 300_000,
  expect: { timeout: 15_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  outputDir: "showcase-output",

  use: {
    baseURL: `http://localhost:${serverPort}`,
    viewport: { width: 1440, height: 900 },
    video: { mode: "on", size: { width: 1440, height: 900 } },
    trace: "off",
    screenshot: "off",
    navigationTimeout: 30_000,
    actionTimeout: 20_000,
    // The suite runs reduced-motion to keep Radix deterministic; the showcase
    // wants the real thing, since the motion is part of what is being shown.
    contextOptions: { reducedMotion: "no-preference" },
  },

  projects: [{ name: "showcase", use: { ...devices["Desktop Chrome"] } }],
});
