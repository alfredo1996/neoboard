# Coverage Strategy — Fixing the Structural Gap

**Current:** 59.2% on new code (required >= 80%)
**Root causes:** Three distinct categories of uncovered code, each needing a different fix.

---

## Category 1: Server-side code not instrumented during E2E (Quick Win)

**Files:** `card-container.tsx`, `chart-renderer.tsx`, `widget-editor-modal.tsx`, `dashboard-container.tsx`, `connections/page.tsx`, `[id]/page.tsx`, `query-editor-panel.tsx`, `graph-exploration-wrapper.tsx`

**Problem:** nextcov has `collectServer: false` in `playwright.config.ts`. These files run server-side during E2E but coverage isn't captured.

**Fix:** Set `collectServer: true`. nextcov connects to the Next.js server via CDP (Chrome DevTools Protocol) and collects V8 coverage from server-rendered code.

```diff
// playwright.config.ts
export const nextcov = {
-  collectServer: false,
+  collectServer: true,
};
```

**Prerequisite:** The Next.js dev server must expose a debug port. Check if `global-setup.ts` starts the server with `--inspect` or if nextcov handles it automatically.

**Impact:** Should cover most of the 0% app component files since E2E tests exercise these code paths.

---

## Category 2: Vendored cypher-lang has 0% coverage (needs unit tests)

**Files:** `cypher-lang/autocomplete.ts`, `constants.ts`, `cypher.ts`, `parser-adapter.ts`, `signature-help.ts`, `utils.ts`

**Problem:** We vendored these files but didn't add unit tests for them. They're not exercised by E2E because the CodeMirror editor runs entirely client-side and nextcov's client coverage may not capture dynamically-imported CM6 code.

**Options:**
1. **Add Vitest unit tests** in `component/src/lib/cypher-lang/__tests__/` — test the pure functions (autocomplete source, parser adapter, signature help tooltip)
2. **Exclude from coverage** — these are vendored from a well-tested upstream project. Add to `sonar.coverage.exclusions`:
   ```
   component/src/lib/cypher-lang/**
   ```
3. **Both** — exclude from SonarCloud quality gate but add basic smoke tests for our own confidence

**Recommendation:** Option 3. These are vendored files with minimal modifications. Excluding from SonarCloud is honest (we didn't write them), and smoke tests catch regressions from our simplifications.

---

## Category 3: App hooks/utils with partial coverage (needs more unit tests)

**Files:** `use-schema.ts` (36.4%), `schema-prefetch.ts` (16.7%)

**Problem:** These have unit tests but not enough branches are covered. The hooks depend on React Query and Zustand stores.

**Fix:** Add more targeted unit tests:
- `use-schema.ts` — test `createRefreshSchema` with more parameter combinations, test error paths
- `schema-prefetch.ts` — test `buildAuthConfig` with edge cases (missing fields, null values)

---

## CLAUDE.md Changes

### Current rule:
> **Do NOT add Vitest render tests (jsdom + @testing-library/react) in app/.** Component rendering is tested via Playwright E2E with real data. Vitest in app/ is for pure logic, API routes, stores, and hooks only. UI component tests belong in component/ (isolated, no business logic) or as Playwright E2E specs.

### Proposed update:
> **Do NOT add Vitest render tests (jsdom + @testing-library/react) in app/.** Component rendering is tested via Playwright E2E with real data and **server-side coverage collection** (`collectServer: true` in nextcov). Vitest in app/ is for pure logic, API routes, stores, and hooks only. UI component tests belong in component/ (isolated, no business logic) or as Playwright E2E specs.
>
> **Vendored code** (e.g., `component/src/lib/cypher-lang/`) is excluded from SonarCloud coverage requirements but should have basic smoke tests to catch regressions from local modifications.

### sonar-project.properties update:
```diff
sonar.coverage.exclusions=\
  app/src/app/**/layout.tsx,\
  app/src/instrumentation.ts,\
  app/src/middleware.ts,\
  app/src/types/**,\
  app/src/lib/db/schema.ts,\
  app/src/lib/db/index.ts,\
- app/src/lib/auth/config.ts
+ app/src/lib/auth/config.ts,\
+ component/src/lib/cypher-lang/**
```

### playwright.config.ts update:
```diff
export const nextcov = {
-  collectServer: false,
+  collectServer: true,
};
```

---

## Implementation Order

1. **Enable `collectServer: true`** — biggest coverage impact, zero test writing
2. **Exclude vendored cypher-lang** from SonarCloud coverage — honest reporting
3. **Add unit tests** for `use-schema.ts` and `schema-prefetch.ts` edge cases
4. **Update CLAUDE.md** with the new strategy

**Expected coverage after:** ~75-85% (the exact number depends on how much server-side code nextcov can instrument via CDP)

---

## Risk: collectServer: true

nextcov's server collection uses CDP to connect to the Node.js process. This requires:
- The server to be started with `--inspect` or nextcov auto-manages it
- CDP port not conflicting with other services
- Slightly slower E2E runs (CDP overhead)

If it breaks CI, we can fall back to `collectServer: false` and accept the lower coverage with the vendored exclusion still reducing the gap.
