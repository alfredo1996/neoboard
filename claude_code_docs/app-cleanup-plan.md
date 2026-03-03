# Plan: Comprehensive app/ Codebase Cleanup & Simplification

## Context

The `app/` package has grown organically and accumulated dead code, unused dependencies, type safety gaps (`as any` casts), duplicated chart transform logic, and several components exceeding 600+ lines. This cleanup addresses all categories in 7 phases, ordered from lowest to highest risk. Each phase is independently committable and verifiable.

---

## Phase 1: Remove Dead Code — `getSession()` export

**Risk: Minimal**

- **File:** `app/src/lib/auth/session.ts` — Delete `getSession()` (lines 19-25). Exported but never imported anywhere in the codebase.
- **Verify:** `cd app && npm test` + `npm run build`

---

## Phase 2: Remove Unused Dependencies

**Risk: Minimal**

- **File:** `app/package.json` — Remove 3 deps that have zero imports in `app/src/`:
  - `class-variance-authority`
  - `clsx`
  - `@radix-ui/react-slot`
- All three are already declared in `component/package.json` where they're actually used.
- **Verify:** `npm install && npm run build && cd app && npm test`

---

## Phase 3: NextAuth Type Augmentation (Eliminate 7 `as any` casts)

**Risk: Low-Medium**

All 7 `as any` casts exist because NextAuth session/JWT types lack custom `role` and `tenantId` fields.

- **Create:** `app/src/types/next-auth.d.ts` — Module augmentation extending `User`, `Session`, `JWT` with `role: UserRole` and `tenantId: string`
- **Modify 5 files** to remove `as any` casts:
  - `app/src/lib/auth/config.ts` (lines 68, 86, 88)
  - `app/src/lib/auth/session.ts` (line 54)
  - `app/src/components/parameter-widget-renderer.tsx` (line 195)
  - `app/src/app/(dashboard)/page.tsx` (line 50)
  - `app/src/app/(dashboard)/[id]/edit/page.tsx` (line 49)
- **Test:** Write a compile-time type test in `app/src/types/__tests__/next-auth-types.test.ts`
- **Verify:** `cd app && npm test && npx next lint --fix && npm run build`

---

## Phase 4: Chart Registry DRY — Merge Transform Pairs

**Risk: Medium** (protected by ~900 lines of existing tests)

`chart-registry.ts` (548 lines) has 3 pairs of near-identical transforms:
- `transformToBarData` + `transformToBarDataWithMapping` (~60% overlap)
- `transformToLineData` + `transformToLineDataWithMapping` (~60% overlap)
- `transformToPieData` + `transformToPieDataWithMapping` (~60% overlap)

**Changes:**
- Merge each pair into a single function with optional `mapping` parameter
- Fix normalization gap: with-mapping versions currently skip `normalizeValue()` on labels — unified version applies it consistently
- Extract nested helpers from `transformToGraphData()` (7 inner functions) to module level
- Update `chartRegistry` object: `transform` calls the merged fn with no mapping, `transformWithMapping` calls with mapping

**Tests:**
- Existing `chart-registry.test.ts` + `chart-registry-mapping.test.ts` protect against regressions
- Add tests verifying `normalizeValue` is applied to labels even when mapping is active

**Expected:** ~548 lines down to ~420 lines (~130 lines saved)
- **Verify:** `cd app && npx vitest run src/lib/__tests__/chart-registry && npm run build`

---

## Phase 5: Extract `DebouncedTextInput` from `parameter-widget-renderer.tsx`

**Risk: Low**

- **Create:** `app/src/components/debounced-text-input.tsx` — Move self-contained component (lines 98-136 of parameter-widget-renderer.tsx)
- **Modify:** `app/src/components/parameter-widget-renderer.tsx` — Import from new file
- Pure move, no logic changes. Existing tests cover it.
- **Verify:** `cd app && npm test && npm run build`

---

## Phase 6: Split `widget-editor-modal.tsx` (1110 lines)

**Risk: Medium**

Extract presentational subsections as components receiving state via props. Parent keeps all state.

- **Create directory:** `app/src/components/widget-editor/`
- **Extract 4 components:**
  - `chart-type-selector.tsx` — Connection combobox + chart type Select
  - `query-editor-panel.tsx` — Query editor section with hints
  - `parameter-config-section.tsx` — Parameter type/mode/name configuration
  - `parameter-preview.tsx` — Parameter widget preview panel
- **Modify:** `widget-editor-modal.tsx` to import and compose these
- No logic changes — pure extraction. E2E tests serve as regression.

**Expected:** ~1110 lines down to ~550 lines in the main file
- **Verify:** `cd app && npm test && npx next lint --fix && npm run build`

---

## Phase 7: Extract `ChartRenderer` and `TableRenderer` from `card-container.tsx` (619 lines)

**Risk: Medium**

- **Create:**
  - `app/src/components/chart-renderer.tsx` — ChartRenderer switch + dynamic imports (GraphChart, MapChart)
  - `app/src/components/table-renderer.tsx` — TableRenderer with column config
- **Modify:** `card-container.tsx` — Import from new files
- Pure extraction, no logic changes. E2E tests serve as regression.

**Expected:** ~619 lines down to ~300 lines
- **Verify:** `cd app && npm test && npx next lint --fix && npm run build`

---

## Explicitly Deferred (Not Worth the Cost)

- **Dashboard store `updatePage` helper** — Only 213 lines, well-tested, inlining makes methods longer
- **useMemo/useCallback cleanup** — Verified all instances serve legitimate reference stability purposes
- **API route error handling DRY** — Each route has unique validation/permission needs; a shared wrapper would add indirection without meaningful reduction

---

## Verification Strategy

After each phase:
1. `cd app && npm test` — Unit tests pass
2. `cd app && npx next lint --fix` — No lint errors
3. `npm run build` — Type-check + build succeeds

After all phases:
4. `npm run test:e2e` — Full E2E regression (requires Docker)
