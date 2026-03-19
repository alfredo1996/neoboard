# v0.8 Release Review Fixes

Fixes applied based on CodeRabbit review of PR #132.

## Critical Fixes

### 1. Markdown widget: `useMemo` before early return (React hooks rule)
- **File:** `component/src/components/composed/markdown-widget.tsx`
- **Issue:** `useMemo` was called after an early `return`, violating React's rules of hooks.
- **Fix:** Moved `useMemo` before the conditional early return, computing `null` when content is empty.

### 2. Markdown widget: `isSafeUrl` denylist -> allowlist
- **File:** `component/src/components/composed/markdown-widget.tsx`
- **Issue:** Used a denylist (blocking specific schemes) instead of an allowlist. Schemes like `file:`, `intent:` were allowed.
- **Fix:** Rewrote to allowlist: only `http:`, `https:`, `mailto:`, `data:image/`, and relative URLs are permitted.

### 3. iFrame widget: sandbox prop validation
- **File:** `component/src/components/composed/iframe-widget.tsx`
- **Issue:** `sandbox` prop was forwarded verbatim, allowing dangerous token combinations (e.g., `allow-same-origin` + `allow-scripts`).
- **Fix:** Added `sanitizeSandbox()` function with a `SAFE_SANDBOX_TOKENS` allowlist. `allow-same-origin` and other dangerous tokens are stripped.

## Major Fixes

### 4. Query editor: missing cancellation in schema effect
- **File:** `component/src/components/composed/query-editor.tsx`
- **Issue:** Schema effect dispatched reconfiguration unconditionally after async resolve. Rapid schema changes could cause stale dispatches.
- **Fix:** Added `cancelled` flag and cleanup function to the schema effect.

### 5. Language resolver: prototype pollution guard
- **File:** `component/src/lib/language-resolvers.ts`
- **Issue:** `languageResolvers[key]` without own-property check could resolve inherited properties (`__proto__`, `constructor`).
- **Fix:** Changed to `Object.hasOwn(languageResolvers, key)`.

### 6. Param substitute: prototype chain guard
- **File:** `component/src/lib/param-substitute.ts`
- **Issue:** `key in params` includes inherited properties from the prototype chain.
- **Fix:** Changed to `Object.hasOwn(params, key)`.

### 7. Chart renderer: missing props on new chart types
- **File:** `app/src/components/chart-renderer.tsx`
- **Issue:** `colorblindMode`, `stylingRules`, and `paramValues` were not forwarded to gauge, sankey, sunburst, radar, and treemap chart types.
- **Fix:** Added all three props to each new chart type case in the switch.

### 8. Signature help: tooltip dropped when docs missing
- **File:** `component/src/lib/cypher-lang/signature-help.ts`
- **Issue:** Required `signatures[activeSignature].documentation !== undefined`, dropping valid tooltips that had parameter docs but no top-level docs.
- **Fix:** Removed the `documentation !== undefined` gate.

### 9. Content-only widgets: save as template returns null
- **File:** `app/src/app/(dashboard)/[id]/edit/page.tsx`
- **Issue:** Markdown/iFrame widgets have no `connectionId`, so `conn` was undefined and the template dialog returned null.
- **Fix:** Default to `"postgresql"` connector type when no connection exists.

### 10. CI: missing type-check for connection/ package
- **File:** `.github/workflows/ci.yml`
- **Issue:** `connection/` was installed but never type-checked in CI, so TS regressions could merge behind a green gate.
- **Fix:** Added `Type-check connection` step between component and app type-checks.

### 11. E2E: `waitForEditorReady` silent failure
- **File:** `app/e2e/code-completion.spec.ts`
- **Issue:** Loop exited after 15 polls even if `stableCount` never reached 3, silently passing with an unstable editor.
- **Fix:** Added explicit `throw` when `stableCount < 3` after the loop.

### 12. E2E: `waitForSchemaLoaded` blind sleep
- **File:** `app/e2e/code-completion.spec.ts`
- **Issue:** Used a fixed 3s `waitForTimeout` which could be too short on slow CI or wastefully long on fast machines.
- **Fix:** Replaced with polling loop that checks `data-editor-ready` for 5 consecutive stable checks (1s window).

### 13. Update connection config type: not truly partial
- **File:** `app/src/hooks/use-connections.ts`
- **Issue:** `config` required `uri`, `username`, `password` even for PATCH operations.
- **Fix:** Changed to `Partial<{...}>` so callers can update individual fields without resubmitting secrets.

## Minor Fixes

### 14. Storybook iframe story: executable URL
- **File:** `component/stories/composed/iframe-widget.stories.tsx`
- **Issue:** Used `javascript:alert('xss')` which could execute if sanitization regressed.
- **Fix:** Changed to `not-a-valid-url://test`.

### 15. Sunburst CircleLayout story: duplicate of Default
- **File:** `component/stories/charts/sunburst-chart.stories.tsx`
- **Issue:** `CircleLayout` story had identical args to `Default`.
- **Fix:** Renamed to `NoLabels` with `showLabels: false`.

## New Tests Added

- Prototype pollution guard tests for `resolveLanguageExt` (`__proto__`, `constructor`)
- Sandbox token stripping test for `IframeWidget`
- `isSafeUrl` allowlist tests: `file:`, `intent:`, `mailto:` URLs
