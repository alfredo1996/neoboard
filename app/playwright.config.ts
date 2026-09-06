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
  // Matches the port global-setup gives the server (serverPort + 6130), so two
  // concurrent runs cannot collide on a fixed 9230.
  cdpPort: Number(process.env.TEST_SERVER_PORT ?? 3100) + 6130,
  // On: a failed CDP connect used to be reported through a disabled logger,
  // which is how server coverage came to be declared, documented and never
  // collected (#1606).
  log: true,
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // 2 workers everywhere. Measured locally (2026-06-10, three full runs):
  // 6 workers → 20 hard failures + 71 flaky, 4 workers → 9-11 failures +
  // ~55 flaky — all login/navigation timeouts from server/DB contention —
  // while every one of those tests passes at 2 workers. CI runners are
  // resource-constrained for the same reason (#994).
  // Override with --workers=N on the CLI for experimentation.
  workers: 2,
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
    // Force a fixed, generously-sized viewport for the whole suite. The
    // default Desktop Chrome viewport is 1280×720; tall modal forms (e.g.
    // the connection editor with all advanced settings open) push their
    // submit buttons below the fold and Playwright's "scroll into view"
    // racing with Radix Dialog's own scroll container leaves clicks
    // unresolved. 1280×1024 fits every dialog in the suite without
    // changing per-test code, and never auto-resizes during a run.
    viewport: { width: 1280, height: 1024 },
    // Run the suite as a reduced-motion user (#1458). Radix keeps an overlay
    // mounted until its CSS exit animation reports `animationend`; when a
    // heavy widget (NVL/WebGL) mounts alongside the close, that animation can
    // stall and the dialog stays in the DOM long past any sane budget — the
    // `expect(dialog).not.toBeVisible()` flake across the graph tests. The
    // reduced-motion reset in design-tokens.css sets `animation: none`, which
    // makes Radix unmount synchronously, so the stall cannot occur. This also
    // means the suite exercises the reduced-motion path in CI, which is the
    // accessibility branch that otherwise gets no coverage at all.
    contextOptions: { reducedMotion: "reduce" },
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1024 },
      },
    },
  ],
});
