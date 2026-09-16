---
paths:
  - "**/__tests__/**"
  - "**/*.test.*"
  - "app/e2e/**"
---

# Testing boundaries (app/ package)

| Layer                | Tool                    | Examples                                                                                |
| -------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| Pure functions/utils | Vitest (no DOM)         | chart-plugin-registry, normalize-value, date-utils, query-hash, wrap-with-preview-limit |
| API routes           | Vitest (mocked DB/auth) | Validation, permissions, error handling                                                 |
| Zustand stores       | Vitest (no mocks)       | State transitions, cascading logic                                                      |
| Store orchestration  | Vitest (no DOM)         | parameter-widget-renderer interactions, type coercion                                   |
| Auth helpers         | Vitest (mocked auth)    | Session extraction, signup validation                                                   |
| UI components (app/) | Vitest (jsdom)          | Render tests, branch coverage, error states — `.test.tsx` files                         |
| Full user flows      | Playwright E2E          | Real rendering, real data, real interactions                                            |

**Coverage target: 80% per package** (unit + E2E combined). Track with `npm run test:coverage` in each package.

**Vitest in `app/` uses two project environments:**

- **`unit`** (node): `.test.ts` files — pure logic, API routes, stores, hooks. No DOM.
- **`component`** (jsdom): `.test.tsx` files — render tests with `@testing-library/react`. Mock `@neoboard/components` and Next.js modules (`next/navigation`, `next/dynamic`). Use for branch coverage of UI components that E2E can't reach (error states, edge cases, loading states).

Playwright E2E with **server-side coverage collection** (`collectServer: true` in nextcov config) complements jsdom tests for full user flows. It works because the server is spawned as `node --inspect=<port>` (not `npx`, whose wrapper would bind the inspector port first) with `NODE_V8_COVERAGE` set, and because coverage is finalized **before** the teardown kills the server. The teardown fails the run if `collectServer` is on and no API route file reaches the report — the original defect was silent (#1606). UI component tests in `component/` package remain isolated (no business logic).

**Vendored code** (e.g., `component/src/lib/cypher-lang/`) is excluded from SonarCloud coverage requirements but should have basic smoke tests to catch regressions from local modifications.
