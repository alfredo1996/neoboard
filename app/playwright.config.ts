import { defineConfig, devices } from "@playwright/test";
import type { NextcovConfig } from "nextcov";

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
  // 2 retries in CI: absorbs cold-start flakiness on the first page navigation
  // while the Next.js dev server compiles routes on demand.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  // "github" adds PR annotations; "list" streams each test result to the log
  // so you can follow progress in real time during a CI run.
  // CI: github (PR annotations) + list (real-time stream) + html (artifact for debugging).
  // Local: interactive HTML report.
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : "html",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // 30 s in CI: Next.js compiles routes on demand; the first hit per route
    // can be slow. Locally 15 s is enough since the server is already warm.
    navigationTimeout: process.env.CI ? 30_000 : 15_000,
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Next.js reads .env and .env.local from disk, which would override test container URLs.
    // The global-setup copies .env.test → .env.local so Next.js picks up the right values.
    command: "npx next dev --port 3000",
    port: 3000,
    reuseExistingServer: false,
    // 60 s in CI: gives the dev server more compile time before the first test fires.
    timeout: process.env.CI ? 60_000 : 30_000,
  },
});
