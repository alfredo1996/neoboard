import { defineConfig, devices } from "@playwright/test";

// global-setup writes TEST_SERVER_PORT to process.env before tests run.
const serverPort = process.env.TEST_SERVER_PORT || "3100";

/** Nextcov coverage config — read by loadNextcovConfig() in global-setup/teardown. */
export const nextcov: import("nextcov").NextcovConfig = {
  buildDir: ".next",
  outputDir: "coverage-e2e",
  sourceRoot: "./src",
  include: ["src/**/*.{ts,tsx}"],
  exclude: ["src/**/__tests__/**", "src/**/*.test.ts"],
  reporters: ["lcov", "json", "text-summary"],
  collectServer: true,
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // CI: 2 workers for parallel execution against the production server.
  // Locally: 4 workers — Playwright's auto-detect picks based on CPU cores
  // but collapses to serial under Docker-testcontainer load, turning a
  // ~11-minute run into a ~20-minute run. An explicit number keeps local
  // timing deterministic regardless of host contention.
  workers: process.env.CI ? 2 : 4,
  // CI: github (PR annotations) + list (real-time stream) + blob (for cross-shard merge).
  // Local: interactive HTML report.
  reporter: process.env.CI ? [["github"], ["list"], ["blob"]] : "html",
  // Production build eliminates cold-start compilation — tighter timeouts are safe.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: `http://localhost:${serverPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 15_000,
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
