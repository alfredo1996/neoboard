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
    // Built Storybook output. Build artifact, same category as dist/.next —
    // it is bundled third-party code and linting it reports on nothing anyone
    // wrote.
    "**/storybook-static",
    "**/coverage",
    "**/*.d.ts",
    "stress",
    ".claude",
    // Playwright specs. Deliberate, and recorded rather than implied: they run
    // under their own tsconfig and use globals this config does not model.
    // Revisit with its own config block rather than by deleting this line.
    "**/e2e",
    // Astro docs site — its own toolchain and its own lint setup.
    "docs",
    // Vendored upstream source, modified locally. Excluded from SonarCloud
    // coverage for the same reason; linting it would report on code we did not
    // write and cannot cleanly fix.
    "component/src/lib/cypher-lang",
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
    rules: {
      // eslint-plugin-react-hooks v7 ships React Compiler rules at "error".
      // They flag 20 real sites across the chart internals (graph-chart,
      // map-chart, base-chart, useGraphExploration, creatable-combobox) whose
      // fixes are genuine refactors of the most complex components in the
      // library — not something to couple to a lint-config change (#1547).
      //
      // "warn", NOT "off": the signal is kept and the sites stay visible. The
      // full list is tracked separately; when they are fixed these go back to
      // "error". The gantt `Date.now()`-during-render one in particular is a
      // real render-purity bug.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // The `_` prefix is already the convention in this codebase for a
      // parameter that exists to satisfy a signature — test doubles matching a
      // library's callback shape, mostly. Honour it rather than editing those
      // call sites to satisfy a default the code never agreed to.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // `connection/__tests__` only — NOT test code in general.
    //
    // 145 pre-existing sites here use `any` (fixtures and callback generics)
    // and `require()` (Jest lazy/mocked imports). Both are idiomatic in this
    // suite, which had never been linted before #1547.
    //
    // Scoped this narrowly on purpose. CLAUDE.md says "No `any` without a
    // comment explaining why", and `app/`'s tests already honour that with
    // per-site disables. Relaxing the rule for all test files would silently
    // lower a bar that package already meets, and would have deleted ~100
    // deliberate opt-out comments across app/. Clearing this exception is
    // tracked separately.
    files: ["connection/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Storybook stories call hooks inside `render`, which the rule cannot see
    // as a component because it is not capitalised. Storybook does render it
    // as one, so the 63 reports are not latent bugs — but the fix (extracting
    // a named component per story, as chart-options-panel.stories.tsx already
    // does) is 63 mechanical edits and does not belong in a lint-config
    // change. "warn" keeps them visible; tracked separately (#1547).
    files: ["**/stories/**/*.{ts,tsx}", "**/*.stories.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "warn",
    },
  },
  {
    // Next.js rules apply to the Next.js app only. Applying them repo-wide
    // flagged `connection/src/schema/{neo4j,pg}-schema.ts` for assigning to a
    // variable named `module` — a plain Node library where that name is
    // ordinary, and a rule about Next's bundler that cannot apply there.
    files: ["app/**/*.{ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
]);
