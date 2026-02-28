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
    baseURL: "http://localhost:3000",
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

  webServer: {
    // CI: production build pre-compiles all routes upfront, eliminating cold-start
    // compilation delays. globalSetup writes .env.local before this runs.
    // Local: dev server for fast iteration with HMR.
    command: process.env.CI
      ? "npx next build && npx next start --port 3000"
      : "npx next dev --port 3000",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    // CI: build ~60-90s + start ~5s. Locally: dev server ~15s.
    timeout: process.env.CI ? 180_000 : 30_000,
  },
});
