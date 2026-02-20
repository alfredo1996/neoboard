import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 2 retries in CI: absorbs cold-start flakiness on the first page navigation
  // while the Next.js dev server compiles routes on demand.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
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
    timeout: 30_000,
  },
});
