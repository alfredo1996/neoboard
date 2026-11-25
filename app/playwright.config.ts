import { defineConfig, devices } from "@playwright/test";
import { CDP_OFFSET, resolveServerPort } from "./e2e/server-port";

// One source for the run's port (#1880): an explicit TEST_SERVER_PORT, else a
// free one picked here and written to the env. Playwright evaluates this file
// in the runner before globalSetup and again in each worker (which inherits
// the env), so baseURL, the CDP port, global setup and teardown all agree.
const serverPort = resolveServerPort();

// `--project=serial` or `--project serial`. Workers do not see the runner's
// argv, so the choice rides the env, as the port does.
if (/--project(?:=|\s)serial\b/.test(process.argv.join(" "))) {
  process.env.E2E_SERIAL = "1";
}
const SERIAL_SELECTED = !!process.env.E2E_SERIAL;

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
  cdpPort: serverPort + CDP_OFFSET,
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
  // The blob reporter wipes its output dir on start, so the serial run in CI
  // names its own (E2E_BLOB_DIR) instead of erasing the shard's blob.
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["blob", { outputDir: process.env.E2E_BLOB_DIR ?? "blob-report" }],
      ]
    : "html",
  // Production build eliminates cold-start compilation — tighter timeouts are safe.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  use: {
    baseURL: `http://localhost:${serverPort}`,
    // The first failed attempt keeps its trace (#2311): a test that fails
    // once and passes on retry is what the merge bar scans for, and
    // on-first-retry left that attempt with nothing to diagnose (#2293).
    trace: "retain-on-first-failure",
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
      // *.serial.spec.ts flips deployment-wide state (#2416) and runs alone,
      // in its own invocation (`--project=serial`) after this project ends.
      testIgnore: "**/*.serial.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 1024 },
      },
    },
    // Registered only when asked for by name. A `dependencies: ["chromium"]`
    // chain makes `--shard=N/5` keep both projects in one shard: shard 1 ran
    // the whole suite and shards 2-5 ran nothing. Without the dependency, a
    // bare `playwright test` would run it beside the chromium workers, so it
    // stays out of the default run: `npm run test:e2e` runs chromium, then
    // serial; CI runs serial once, after shard 1's chromium tests.
    ...(SERIAL_SELECTED
      ? [
          {
            name: "serial",
            testMatch: "**/*.serial.spec.ts",
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 1280, height: 1024 },
            },
          },
        ]
      : []),
  ],
});
