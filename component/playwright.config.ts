import { defineConfig } from "@playwright/test";

/**
 * Per-chart render benchmark (#1688) — `npm run bench:charts`.
 *
 * Runs against a static Storybook build, the same artefact CI's story smoke
 * tests are built from, served by vite's preview server; no app, no Docker.
 * One worker on purpose: two charts painting at once would measure the
 * contention, not the chart.
 */
const PORT = 6007;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  // Two themes per test, up to a minute to first paint each — and the 10k
  // graph story keeps NVL's main-thread layout running through the
  // screenshot (72 s locally, so room for a CI runner).
  timeout: 300_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `npm run build-storybook -- --quiet && npx vite preview --outDir storybook-static --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
  },
});
