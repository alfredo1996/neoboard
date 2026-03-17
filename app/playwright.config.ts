import { defineConfig, devices } from "@playwright/test";
import type { NextcovConfig } from "nextcov";
import * as dotenv from "dotenv";
import * as path from "node:path";

// Load .env.test so TEST_SERVER_PORT (written by global-setup) is available.
dotenv.config({ path: path.resolve(__dirname, ".env.test"), quiet: true });

const serverPort = process.env.TEST_SERVER_PORT || "3100";

/** Nextcov coverage config — read by loadNextcovConfig() in global-setup/teardown. */
export const nextcov: NextcovConfig = {
  buildDir: ".next",
  outputDir: "coverage-e2e",
  sourceRoot: "./src",
  include: ["src/**/*.{ts,tsx}"],
  exclude: ["src/**/__tests__/**", "src/**/*.test.ts"],
  reporters: ["lcov", "json", "text-summary"],
  collectServer: false,
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // CI: 2 workers for parallel execution against the production server.
  // Locally: let Playwright auto-detect based on CPU cores.
  workers: process.env.CI ? 2 : undefined,
  // CI: github (PR annotations) + list (real-time stream) + html (artifact for debugging).
  // Local: interactive HTML report.
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : "html",
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
