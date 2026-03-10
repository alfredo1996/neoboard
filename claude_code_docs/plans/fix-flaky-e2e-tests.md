# Plan: Fix 6 Flaky E2E Tests

## Summary

Analysis of the last full Playwright suite run on `feat/issue-33-rule-based-styling` reveals **6 tests that failed on first attempt but passed on retry** (retries: 1). All 6 share a common root cause pattern: **CodeMirror editor text insertion races during the `typeInEditor` helper**. The retry mask conceals real flakiness that wastes CI time (12 extra retries = ~2 min added per run) and erodes trust in the suite.

### The 6 Flaky Tests

| # | Spec File | Test Name | Root Cause Category |
|---|-----------|-----------|-------------------|
| 1 | `auto-refresh.spec.ts` | should enable auto-refresh and persist setting after reload | **Stale auto-refresh from prior test + shared dashboard** |
| 2 | `charts.spec.ts` | Neo4j bar chart -- fetches data and renders canvas | **CM6 readonly race** |
| 3 | `form-widget.spec.ts` | form widget shows 'Write permission required' when can_write is false | **`beforeAll` race: PATCH can_write fires before user row fully committed** |
| 4 | `parameters.spec.ts` | should create a widget with click action and verify action rules UI | **CM6 readonly race** |
| 5 | `widget-states.spec.ts` | widget card should show actions menu with edit and remove | **CM6 readonly race** |
| 6 | `widgets.spec.ts` | should add a table widget | **CM6 readonly race** |

---

## Architecture Decision

**No architectural changes needed.** All fixes are confined to the E2E test layer (`app/e2e/`) and one component tweak in the `component/` package. No schema migrations, API changes, or store changes.

## Affected Packages

- `app/` -- E2E test files only (`app/e2e/fixtures.ts` and the 6 spec files)
- `component/` -- `query-editor.tsx` (minor: expose a deterministic "editor-ready" signal)

---

## Root Cause Analysis

### Category A: CodeMirror Readonly Race (Tests #2, #4, #5, #6)

**Evidence:** All 4 failure screenshots show the Add Widget dialog open with `"Select a connection first to write a query"` placeholder still visible inside the CM6 editor, even though the Connection combobox already shows "Movies Graph (Neo4j) (neo4j)" selected. The Run and Clear buttons are disabled. The `typeInEditor` helper timed out trying to insert text into a readonly editor.

**Root cause chain:**
1. Test selects connection via combobox click + option click.
2. React state updates `connectionId`, which flips `readOnly` from `true` to `false` in `QueryEditorPanel`.
3. The `QueryEditor` component uses a **Compartment reconfiguration** (`readOnlyCompartmentRef`) triggered by a `useEffect` on `readOnly` prop change.
4. This `useEffect` depends on `viewRef.current` and `readOnlyCompartmentRef.current` being populated by `initEditor()`, which is async (2 rounds of dynamic imports).
5. **Race:** When the connection combobox closes, if the dialog re-renders before `initEditor` has completed its async setup, the `readOnly` effect fires but `viewRef.current` is still `null` -- the reconfiguration silently does nothing. CM6 stays readonly.
6. `typeInEditor` checks `data-readonly="false"` (React attribute) and `contenteditable="true"` (DOM attribute), but CM6's internal readonly compartment was never reconfigured. The `insertText()` call succeeds at the keyboard API level but CM6 drops the characters because its EditorState is still readonly.
7. The toPass retry loop catches this (text not found) and retries, but by the 15s timeout it exhausts retries on the first attempt. The Playwright retry (#2) succeeds because initEditor has long since completed.

**Why the `data-readonly` / `contenteditable` guards in `typeInEditor` are insufficient:**
- `data-readonly` is set by React on the container div -- it reflects the React prop, not the CM6 internal state.
- `contenteditable` on `.cm-content` can be `true` even when the CM6 EditorState has `readOnly: true` via the compartment, because CM6 manages readonly through transaction filtering, not DOM attributes.

### Category B: Auto-Refresh Shared Dashboard Pollution (Test #1)

**Evidence:** The failure screenshot shows the auto-refresh trigger button displaying "5s . 5s" instead of the expected "30s". The page snapshot confirms `button "5s . 5s"`.

**Root cause:** The two auto-refresh tests share the seeded "Movie Analytics" dashboard. They run in parallel (Playwright `fullyParallel: true`). Test 2 ("custom interval") sets a 5s interval, and test 1 ("persist after reload") reads the dashboard state and sees "5s" leftover from test 2's incomplete cleanup. The `waitForResponse` on PUT may also resolve with test 2's PUT response instead of test 1's.

### Category C: `beforeAll` Race in Write Permission Test (Test #3)

**Evidence:** The failure screenshot shows the Users page with "No Write Creator" visible and `can_write` switch still checked (true), even though `beforeAll` called `PATCH /api/users/${id}` with `canWrite: false`. The error-context.md confirms the user row has `switch [checked]`.

**Root cause:** The `beforeAll` block creates a user and immediately patches `canWrite: false`. However:
1. The PATCH API call and the subsequent `context.close()` race: the browser context closes before the PATCH response is fully committed.
2. The test then logs in as the no-write user, but the session JWT was minted before the `canWrite` patch was committed, so the session still carries `canWrite: true`.

---

## Ordered Tasks

### Task 1 (M) -- Fix CM6 Readonly Race in `typeInEditor`

**Problem:** `typeInEditor` checks React-level `data-readonly` and DOM-level `contenteditable`, but CM6's internal readonly state is governed by an async Compartment reconfiguration that may not have fired yet.

**Fix -- Use CM6 Dispatch API instead of keyboard events:**

Replace the keyboard-based text insertion with a direct CM6 dispatch call via `page.evaluate()`. This bypasses the contenteditable layer entirely and works regardless of readonly state timing, because if the dispatch is rejected by a readonly filter, we can detect it and retry.

```typescript
// In fixtures.ts -- typeInEditor replacement
export async function typeInEditor(
  dialog: Locator,
  page: Page,
  query: string,
) {
  const cmContainer = dialog.locator("[data-testid='codemirror-container']");

  // Wait for CM6 to mount
  await cmContainer.locator(".cm-editor").waitFor({ state: "visible", timeout: 10_000 });

  // Wait for the React wrapper to signal writable
  await expect(cmContainer).toHaveAttribute("data-readonly", "false", { timeout: 10_000 });

  // Use the CM6 dispatch API directly to insert text.
  // This avoids the race where contenteditable is true but the
  // EditorState readonly compartment hasn't been reconfigured yet.
  await expect(async () => {
    const inserted = await cmContainer.evaluate((el: HTMLElement, text: string) => {
      // Access the CM6 EditorView from the .cm-editor element
      const cmEditor = el.querySelector(".cm-editor") as HTMLElement & { cmView?: { view: any } };
      const view = cmEditor?.cmView?.view;
      if (!view) return false;

      // Check if readonly via EditorState
      if (view.state.readOnly) return false;

      // Replace all content
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });

      // Verify
      return view.state.doc.toString().includes(text.substring(0, 20));
    }, query);

    if (!inserted) {
      throw new Error("CM6 dispatch failed -- editor likely still readonly or not mounted");
    }
  }).toPass({ timeout: 15_000 });
}
```

**Fallback approach (if `cmView` is minified in production build):**

If `cmView` is inaccessible in the production bundle, add a stable `data-testid="cm-editor-ready"` attribute to the QueryEditor component that is set only after the `initEditor` async function completes AND the readonly compartment has been reconfigured. Then `typeInEditor` waits for this attribute before attempting text insertion.

In `component/src/components/composed/query-editor.tsx`:
```typescript
// After initEditor completes and readOnly effect fires:
containerRef.current?.setAttribute("data-editor-ready", "true");
```

**Files to modify:**
- `app/e2e/fixtures.ts` -- rewrite `typeInEditor`
- `component/src/components/composed/query-editor.tsx` -- add `data-editor-ready` signal (fallback)

### Task 2 (S) -- Fix Auto-Refresh Test Isolation

**Problem:** Two tests mutate the same seeded dashboard in parallel.

**Fix:** Each auto-refresh test should use its own isolated dashboard created via `createTestDashboard`. Alternatively, serialize the two tests with `test.describe.serial()`.

Option A (preferred -- full isolation):
```typescript
test.describe("Auto-refresh", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Use the seeded "Movie Analytics" layout by duplicating it via API
    // or create a fresh dashboard with at least one widget.
  });
```

Option B (simpler -- serialized):
```typescript
test.describe.serial("Auto-refresh", () => {
  // ...existing code...
  // Add cleanup inside the first test to reset the interval to "Off" before it
  // proceeds to reload, ensuring test 2 starts from a clean state.
});
```

Option B is simpler and sufficient since both tests must clean up the same dashboard anyway.

**Files to modify:**
- `app/e2e/auto-refresh.spec.ts` -- wrap in `test.describe.serial()` or create isolated dashboards

### Task 3 (S) -- Fix Write Permission `beforeAll` Race

**Problem:** `beforeAll` creates a user, patches `canWrite`, and closes the browser context. The test body then logs in as the patched user, but the session JWT may carry stale claims.

**Fix:**
1. After the PATCH call, verify the response is `200` before proceeding.
2. Wait for the PATCH to commit by re-fetching the user and asserting `canWrite === false`.
3. Do NOT close the context until after verification.

```typescript
// In beforeAll:
const patchRes = await page.request.patch(`/api/users/${creatorUserId}`, {
  data: { canWrite: false },
});
expect(patchRes.ok()).toBe(true);

// Verify the patch was committed
const verifyRes = await page.request.get("/api/users");
const updatedUsers = await verifyRes.json();
const patched = updatedUsers.find((u: { id: string }) => u.id === creatorUserId);
expect(patched.canWrite).toBe(false);

await context.close();
```

**Files to modify:**
- `app/e2e/form-widget.spec.ts` -- add PATCH response verification in `beforeAll`

### Task 4 (S) -- Add Diagnostic Logging to `typeInEditor` Failures

Add better error messages to `typeInEditor` so future flakiness is diagnosable without needing to inspect trace.zip files.

```typescript
// On failure, log:
// - data-readonly attribute value
// - contenteditable attribute value
// - CM6 EditorState.readOnly value (via evaluate)
// - Whether viewRef is populated
```

**Files to modify:**
- `app/e2e/fixtures.ts`

### Task 5 (S) -- Increase `typeInEditor` Robustness Against Connection Selection Timing

Some tests select the connection first, others select chart type first. The ones that fail most often (charts, parameters, widget-states, widgets) all select connection AFTER opening the dialog. This triggers a React re-render that may cause CM6 to remount.

**Fix:** In tests that select connection AFTER opening the dialog, add an explicit wait for the CM6 editor to transition from readonly to writable before calling `typeInEditor`:

```typescript
// After selecting connection:
await dialog.getByRole("combobox").nth(0).click();
await page.getByRole("option").first().click();

// Wait for CM6 to become writable before typing
const cmContainer = dialog.locator("[data-testid='codemirror-container']");
await expect(cmContainer).toHaveAttribute("data-readonly", "false", { timeout: 10_000 });
```

This is a belt-and-suspenders approach alongside the `typeInEditor` fix.

**Files to modify:**
- `app/e2e/charts.spec.ts`
- `app/e2e/parameters.spec.ts`
- `app/e2e/widget-states.spec.ts`
- `app/e2e/widgets.spec.ts`

---

## Migration Needed?

No. All changes are test-layer and component-level attribute additions.

## Security Checklist

- [x] No credentials or secrets affected
- [x] No query execution changes
- [x] No API route changes
- [x] No authentication/authorization changes
- [x] `page.evaluate()` in E2E tests only accesses CM6 view -- no security concern in test context

## Testing Strategy

| Change | Validation |
|--------|-----------|
| `typeInEditor` rewrite | Run the 4 affected tests 10x locally: `npx playwright test charts.spec.ts parameters.spec.ts widget-states.spec.ts widgets.spec.ts --repeat-each=10` |
| Auto-refresh serialization | Run `npx playwright test auto-refresh.spec.ts --repeat-each=10` |
| Write permission fix | Run `npx playwright test form-widget.spec.ts --repeat-each=5 --grep "Write permission"` |
| Full suite | `cd app && npx playwright test` -- expect 0 retries needed |

**Success metric:** Full suite passes with `retries: 0` on 3 consecutive local runs.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `cmView` not accessible in production builds (minified) | Medium | High -- Task 1 primary fix won't work | Task 1 includes a fallback approach using `data-editor-ready` attribute |
| `test.describe.serial()` for auto-refresh makes suite slower | Low | Low -- 2 tests, ~10s overhead | Acceptable tradeoff for reliability; can parallelize later with dashboard isolation |
| CM6 internal API changes in future upgrades break `page.evaluate` dispatch | Low | Medium | The fallback (`data-editor-ready` attribute) doesn't depend on CM6 internals |

## Suggested GitHub Issues

**No new issues needed.** These are all fixes to existing E2E infrastructure on the current branch (`feat/issue-33-rule-based-styling`). The fixes should be included in the existing PR #89 or a follow-up chore PR.

If the team prefers tracking:
- `chore: fix CM6 readonly race in E2E typeInEditor helper` -- covers Tasks 1, 4, 5
- `chore: fix auto-refresh E2E test isolation` -- covers Task 2
- `chore: fix write permission E2E beforeAll race` -- covers Task 3
