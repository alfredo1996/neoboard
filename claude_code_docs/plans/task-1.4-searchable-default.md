# Task 1.4 — Param-Select: Always Searchable by Default

**Parent issue:** #93 (Widget UX Polish)
**Parent plan:** `issue-93-plan.md`
**Size:** S (Small)
**Date:** 2026-03-10

---

## Summary

Change the default value of `searchable` from `false` to `true` for the parameter-select chart type. This makes every NEW param-select widget render the Command popover (with a search input) instead of the basic Radix Select. Existing widgets with `searchable: false` explicitly saved in `chartOptions` are unaffected because persisted values override defaults.

---

## Architecture Decision

This is purely a **default value change** in three locations. No new components, no schema migration, no API changes. The `searchable` boolean is already a first-class chart option stored in `settings.chartOptions` (JSON column). Changing the default means:

1. `getDefaultChartSettings("parameter-select")` returns `{ searchable: true, ... }` instead of `{ searchable: false, ... }`.
2. When `chart-renderer.tsx` reads `settings.searchable` for a widget that never explicitly set it, the fallback `?? false` must become `?? true`.
3. The `ParameterWidgetRenderer` prop default must flip from `false` to `true`.
4. The `ParamSelector` and `ParamMultiSelector` component prop defaults remain `false` — they are presentational and receive the resolved value from the app layer. No component/ prop defaults need to change (the app layer always passes the prop explicitly).

---

## Affected Files

| # | File | Package | Change |
|---|------|---------|--------|
| 1 | `component/src/components/composed/chart-options-schema.ts` | component/ | Line 202: `default: false` -> `default: true` |
| 2 | `app/src/components/chart-renderer.tsx` | app/ | Line 255: `?? false` -> `?? true` |
| 3 | `app/src/components/parameter-widget-renderer.tsx` | app/ | Line 65: `searchable = false` -> `searchable = true` |

**NOT changed (intentionally):**
- `component/src/components/composed/parameter-widgets/param-selector.tsx` line 65 — prop default stays `false`. The app layer always passes the prop explicitly.
- `component/src/components/composed/parameter-widgets/param-multi-selector.tsx` line 56 — same reasoning.
- `app/src/lib/form-field-def.ts` — form fields have their own `searchable` per-field config; the param-select default does not affect forms.

---

## Implementation Plan (TDD: Red -> Green -> Refactor)

### Step 1: RED — Write failing unit test in component/ package

**File:** `component/src/components/composed/__tests__/chart-options-schema.test.ts`

Add a new test case inside the existing `describe("getDefaultChartSettings")` block:

```typescript
it("defaults searchable to true for parameter-select", () => {
  const d = getDefaultChartSettings("parameter-select");
  expect(d.searchable).toBe(true);
});
```

**Run:** `cd component && npm test -- --run chart-options-schema`

**Expected:** FAIL — `d.searchable` is currently `false`.

### Step 2: GREEN — Change the default in chart-options-schema.ts

**File:** `component/src/components/composed/chart-options-schema.ts`
**Line 202:** Change `default: false` to `default: true` on the `searchable` option.

Before:
```typescript
{ key: "searchable", label: "Search-as-you-type", type: "boolean", default: false, category: "Parameter", ... },
```

After:
```typescript
{ key: "searchable", label: "Search-as-you-type", type: "boolean", default: true, category: "Parameter", ... },
```

**Run:** `cd component && npm test -- --run chart-options-schema`

**Expected:** PASS.

### Step 3: RED — Verify chart-renderer fallback mismatch (manual inspection)

There is no unit test for `chart-renderer.tsx` (it is a React component tested via E2E), but we must update the fallback to stay consistent. This is a code-review step — the change is trivial and will be validated by E2E.

### Step 4: GREEN — Update chart-renderer.tsx fallback

**File:** `app/src/components/chart-renderer.tsx`
**Line 255:** Change `?? false` to `?? true`.

Before:
```typescript
searchable={(settings.searchable as boolean | undefined) ?? false}
```

After:
```typescript
searchable={(settings.searchable as boolean | undefined) ?? true}
```

### Step 5: GREEN — Update parameter-widget-renderer.tsx prop default

**File:** `app/src/components/parameter-widget-renderer.tsx`
**Line 65:** Change `searchable = false` to `searchable = true`.

Before:
```typescript
searchable = false,
```

After:
```typescript
searchable = true,
```

### Step 6: REFACTOR — Lint and type-check

Run:
```bash
cd app && npx next lint --fix
npm run build
```

Ensure no lint errors or type errors.

### Step 7: E2E Test — Verify searchable is on by default

**File:** `app/e2e/parameters.spec.ts`

Add a new test case that creates a param-select widget WITHOUT explicitly toggling searchable, then verifies the Command popover (search input) renders instead of the basic Radix Select:

```typescript
test("param-select defaults to searchable (Command popover)", async ({ page }) => {
  // 1. Click "Add Widget"
  await page.getByRole("button", { name: "Add Widget" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add Widget" });

  // 2. Select "Parameter Selector" chart type
  await dialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Parameter Selector" }).click();

  // 3. Select a connection
  await dialog.getByRole("combobox").nth(0).click();
  await page.getByRole("option").first().click();

  // 4. Fill seed query
  await dialog.locator("#seed-query").fill(
    "MATCH (m:Movie) RETURN DISTINCT m.released ORDER BY m.released LIMIT 10"
  );

  // 5. Set parameter name
  const paramInput = dialog.getByLabel("Parameter Name");
  await paramInput.fill("year_default_search");

  // 6. Save (do NOT toggle searchable — it should be on by default)
  await dialog.getByRole("button", { name: "Save" }).click();

  // 7. Verify the widget rendered uses a combobox (Command popover)
  //    not a basic Select trigger. The combobox role comes from the
  //    Button with role="combobox" in the searchable ParamSelector.
  const widget = page.locator('[data-widget-type="parameter-select"]').last();
  await expect(widget).toBeVisible({ timeout: 10_000 });

  // The searchable ParamSelector renders a button with role="combobox"
  // and the ChevronsUpDown icon. Click it to open the popover.
  const combobox = widget.getByRole("combobox");
  await expect(combobox).toBeVisible();
  await combobox.click();

  // The Command popover should show a search input
  await expect(page.getByPlaceholder("Search…")).toBeVisible();
});
```

**Note:** The exact selectors may need adjustment based on how the dashboard renders param-select widgets. The key assertion is that the search input (`placeholder="Search..."`) appears inside the dropdown without the user having toggled the searchable option.

**Run:** `cd app && npx playwright test parameters.spec.ts`

---

## Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| **New widget** (no saved `chartOptions.searchable`) | `getDefaultChartSettings` returns `true` -> searchable by default |
| **Existing widget with `searchable: false` saved** | Persisted value `false` wins over new default -> stays non-searchable |
| **Existing widget with `searchable: true` saved** | No change in behavior |
| **Existing widget with no `searchable` key in JSON** | `chart-renderer.tsx` fallback `?? true` kicks in -> becomes searchable |

The last case is the only behavioral change for existing data. Widgets that were created before `searchable` was added as a chart option will not have the key in their JSON. Previously they fell back to `false` (basic Select). After this change they fall back to `true` (searchable Command popover). This is intentional and is the desired UX improvement.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing widgets without `searchable` key become searchable | Medium | Low (UX improvement, not breakage) | Intentional. Users can toggle off in chart options. |
| ParamSelector `onSearch` is undefined when searchable is true but no `onSearch` provided | Low | None | ParamSelector already guards: `onSearch?.(term)` with optional chaining |
| Seed query re-fires on every keystroke for newly-searchable widgets | Low | Low | `ParameterWidgetRenderer` already debounces search term (300ms) |

---

## Checklist

- [ ] Write failing test (`getDefaultChartSettings("parameter-select").searchable === true`)
- [ ] Run test, confirm RED
- [ ] Change `chart-options-schema.ts` default to `true`
- [ ] Run test, confirm GREEN
- [ ] Change `chart-renderer.tsx` fallback to `?? true`
- [ ] Change `parameter-widget-renderer.tsx` prop default to `true`
- [ ] Run `cd app && npx next lint --fix`
- [ ] Run `npm run build` (type-check)
- [ ] Run `cd component && npm test` (all component tests pass)
- [ ] Run `cd app && npm test` (all app unit tests pass)
- [ ] Add E2E test to `parameters.spec.ts`
- [ ] Run `cd app && npx playwright test parameters.spec.ts` (E2E passes)
