import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
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
