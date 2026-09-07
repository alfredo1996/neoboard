import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Any `__tests__` under src, not just the one at its root. CLAUDE.md says
    // tests live next to the file under test, and the old glob silently
    // collected nothing for anyone who followed it (#1633).
    include: ["src/**/__tests__/**/*.test.ts"],
    // See app/vitest.config.ts — shuffled deliberately (#1630). Two suites
    // here passed only in declaration order: the credential-probe file was
    // green solely because its shell-injection fixture, which installs a
    // poisoned config that `clearAllMocks` does not undo, happened to be
    // declared last.
    sequence: { shuffle: { tests: true, files: false } },
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/*.d.ts"],
      // Floors, not targets: each sits a few points under the value measured
      // on 2026-09-06, so ordinary churn does not trip them but a real
      // regression does. Nothing enforced coverage before this (#1608) — a
      // package could have halved and every check would still have passed.
      // Raise a floor when the real number rises; never lower one to go green.
      thresholds: {
        statements: 86,
        branches: 85,
        functions: 75,
        lines: 86,
      },
    },
  },
});
