import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Cap worker forks at half the machine (#1240). Vitest's default is
    // ~availableParallelism, and each fork here loads jsdom + React + the
    // component library — so on a many-core machine the suite runs out of
    // headroom before it runs out of cores and workers start failing to boot
    // ("Timeout waiting for worker to respond"), taking whole test files with
    // them. Measured on a 10-core box: default = 889s with 96 failures and 9
    // files never collected; at this setting = 37s, everything green.
    //
    // A percentage rather than a fixed number so CI runners (fewer vCPUs)
    // scale down with it instead of inheriting a value tuned for a laptop.
    // Confirmed harmless on CI: the unit job went 8m08s -> 8m20s.
    maxWorkers: "50%",
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov", "json"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/__tests__/**", "src/**/*.d.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/__tests__/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["src/**/__tests__/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./vitest.setup.tsx"],
          css: true,
        },
      },
    ],
  },
});
