import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "**/dist",
    "**/.next",
    "**/node_modules",
    "component",
    "connection",
    "connector-sdk",
    "**/coverage",
    "**/*.d.ts",
    "stress",
    ".claude",
    "**/e2e",
    "docs",
    // Local cache written by the design-sync tool. Not source, not tracked —
    // without this, `npm run lint` reports hundreds of errors from generated
    // preview files on any machine that has run design-sync (#1253).
    ".design-sync",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
]);
