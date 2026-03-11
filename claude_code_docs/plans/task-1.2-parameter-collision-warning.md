# Task 1.2 — Parameter Name Collision Warning

**Parent issue:** #93 (Widget UX Polish)
**Parent plan:** `issue-93-plan.md`
**Size:** S (Small)
**Date:** 2026-03-10

---

## Summary

Add a pure utility function `findParameterCollisions()` to detect when a parameter name is already used by another widget on the same dashboard, and display an info banner inside the widget editor modal when collisions are found. This helps users make intentional decisions when sharing a parameter name across multiple widgets (which is valid but can cause unexpected cross-filtering).

**Scope restriction:** Task 1.1 (CrossFilterTag tooltip) has NOT been implemented yet. This plan covers only:
1. The `findParameterCollisions` pure utility function.
2. The info banner in `widget-editor-modal.tsx` (both for param-select and click-action parameter names).

The `CrossFilterTag` tooltip wiring in `dashboard-container.tsx` is deferred until Task 1.1 is completed.

---

## Architecture Decision

### AD-2 from parent plan: Pure function for collision detection

The collision detection logic lives in `app/src/lib/collect-parameter-names.ts` alongside the existing `collectParameterNames` function. This is the natural home because:
- It already imports the `DashboardLayoutV2` and `ClickAction` types.
- It already has the `PARAM_REGEX` pattern for `$param_xxx` extraction.
- The existing function scans the same three parameter sources (click action, query refs, param-select options).

The new `findParameterCollisions` function differs from `collectParameterNames` in three ways:
1. It **excludes** a specific widget (the one being edited) from the scan.
2. It returns **per-widget** results (widget ID + title) instead of a flat deduplicated list.
3. It accepts a specific `parameterName` to search for, rather than collecting all names.
4. It also scans click action **rules** (`ClickAction.rules[].parameterMapping.parameterName`), which the existing function currently does not.

The widget editor modal already receives a `layout` prop and the current `widget` object, so it has all the data needed to call the function without new data fetching.

---

## Affected Files

| # | File | Package | Change |
|---|------|---------|--------|
| 1 | `app/src/lib/collect-parameter-names.ts` | app/ | Add `findParameterCollisions()` function. Also update `collectParameterNames` to scan `rules[]` for completeness. |
| 2 | `app/src/lib/__tests__/collect-parameter-names.test.ts` | app/ | Add `describe("findParameterCollisions")` test suite with all scenarios. |
| 3 | `app/src/components/widget-editor-modal.tsx` | app/ | Import `findParameterCollisions`, compute collisions reactively, render info `<Alert>` banner. Add `Info` icon import from lucide-react. |

**NOT changed (deferred to Task 1.1):**
- `component/src/components/composed/cross-filter-tag.tsx` — tooltip prop addition.
- `app/src/components/dashboard-container.tsx` — tooltip wiring.

---

## Implementation Plan (TDD: Red -> Green -> Refactor)

### Step 1: RED — Write failing unit tests for `findParameterCollisions`

**File:** `app/src/lib/__tests__/collect-parameter-names.test.ts`

Add a new `describe("findParameterCollisions")` block with these test cases:

```typescript
import { findParameterCollisions } from "../collect-parameter-names";

describe("findParameterCollisions", () => {
  it("returns empty array when no collisions exist", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
          settings: { title: "My Bar", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "foo", sourceField: "x" } } } },
        { id: "w2", chartType: "table", connectionId: "c1", query: "RETURN 1", settings: { title: "My Table" } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "foo")).toEqual([]);
  });

  it("detects collision from click action parameterMapping", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
          settings: { title: "Widget A", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "dept", sourceField: "x" } } } },
        { id: "w2", chartType: "pie", connectionId: "c1", query: "RETURN 1",
          settings: { title: "Widget B", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "dept", sourceField: "y" } } } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "dept")).toEqual([
      { widgetId: "w2", title: "Widget B" },
    ]);
  });

  it("detects collision from $param_xxx query reference", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
          settings: { title: "Setter", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "region", sourceField: "x" } } } },
        { id: "w2", chartType: "table", connectionId: "c1",
          query: "SELECT * FROM t WHERE region = $param_region",
          settings: { title: "Consumer" } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "region")).toEqual([
      { widgetId: "w2", title: "Consumer" },
    ]);
  });

  it("detects collision from param-select parameterName", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "parameter-select", connectionId: "c1", query: "",
          settings: { title: "Selector A", chartOptions: { parameterName: "year" } } },
        { id: "w2", chartType: "parameter-select", connectionId: "c1", query: "",
          settings: { title: "Selector B", chartOptions: { parameterName: "year" } } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "year")).toEqual([
      { widgetId: "w2", title: "Selector B" },
    ]);
  });

  it("detects collision from click action rules", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
          settings: { title: "Widget A", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "name", sourceField: "x" } } } },
        { id: "w2", chartType: "table", connectionId: "c1", query: "RETURN 1",
          settings: { title: "Widget B", clickAction: {
            type: "set-parameter",
            rules: [
              { id: "r1", type: "set-parameter", parameterMapping: { parameterName: "name", sourceField: "col1" } },
            ],
          } } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "name")).toEqual([
      { widgetId: "w2", title: "Widget B" },
    ]);
  });

  it("returns multiple collisions across pages", () => {
    const layout = makeLayout([
      {
        id: "p1", title: "Page 1",
        widgets: [
          { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
            settings: { title: "Setter", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "dept", sourceField: "x" } } } },
          { id: "w2", chartType: "table", connectionId: "c1",
            query: "SELECT * FROM t WHERE d = $param_dept", settings: { title: "Table P1" } },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
      },
      {
        id: "p2", title: "Page 2",
        widgets: [
          { id: "w3", chartType: "parameter-select", connectionId: "c1", query: "",
            settings: { title: "Selector P2", chartOptions: { parameterName: "dept" } } },
        ],
        gridLayout: [{ i: "w3", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    const result = findParameterCollisions(layout, "w1", "dept");
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ widgetId: "w2", title: "Table P1" });
    expect(result).toContainEqual({ widgetId: "w3", title: "Selector P2" });
  });

  it("excludes the current widget from results (self-exclusion)", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "parameter-select", connectionId: "c1", query: "",
          settings: { title: "Self", chartOptions: { parameterName: "country" } } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "country")).toEqual([]);
  });

  it("returns empty array for empty or missing parameterName", () => {
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1", settings: { title: "A" } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
    }]);
    expect(findParameterCollisions(layout, "w1", "")).toEqual([]);
  });

  it("deduplicates widget when it matches via multiple sources", () => {
    // w2 both consumes $param_dept in its query AND sets dept via click action
    const layout = makeLayout([{
      id: "p1", title: "Page 1",
      widgets: [
        { id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
          settings: { title: "A", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "dept", sourceField: "x" } } } },
        { id: "w2", chartType: "table", connectionId: "c1",
          query: "SELECT * FROM t WHERE d = $param_dept",
          settings: { title: "B", clickAction: { type: "set-parameter", parameterMapping: { parameterName: "dept", sourceField: "y" } } } },
      ],
      gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }, { i: "w2", x: 4, y: 0, w: 4, h: 3 }],
    }]);
    const result = findParameterCollisions(layout, "w1", "dept");
    // Should appear only once even though w2 matches both via query and click action
    expect(result).toEqual([{ widgetId: "w2", title: "B" }]);
  });
});
```

**Run:** `cd app && npm test -- --run collect-parameter-names`

**Expected:** FAIL — `findParameterCollisions` is not exported from the module.

---

### Step 2: GREEN — Implement `findParameterCollisions` in `collect-parameter-names.ts`

**File:** `app/src/lib/collect-parameter-names.ts`

Add the following function after the existing `collectParameterNames`:

```typescript
export interface ParameterCollision {
  widgetId: string;
  title: string;
}

/**
 * Finds widgets on the dashboard that reference the given parameter name,
 * excluding the widget identified by `currentWidgetId`.
 *
 * Scans the same three sources as `collectParameterNames`:
 * 1. Click action `parameterMapping.parameterName` (legacy single-rule)
 * 2. Click action `rules[].parameterMapping.parameterName` (multi-rule)
 * 3. `$param_xxx` references in widget queries
 * 4. Param-select widget `parameterName` in chartOptions
 *
 * Returns a deduplicated array of { widgetId, title } for colliding widgets.
 */
export function findParameterCollisions(
  layout: DashboardLayoutV2,
  currentWidgetId: string,
  parameterName: string,
): ParameterCollision[] {
  if (!parameterName) return [];

  const collisions = new Map<string, ParameterCollision>();

  for (const page of layout.pages) {
    for (const widget of page.widgets) {
      if (widget.id === currentWidgetId) continue;
      if (collisions.has(widget.id)) continue;

      const widgetTitle = (widget.settings?.title as string) ?? "";

      // 1. Click action parameterMapping (legacy)
      const clickAction = widget.settings?.clickAction as ClickAction | undefined;
      if (clickAction?.parameterMapping?.parameterName === parameterName) {
        collisions.set(widget.id, { widgetId: widget.id, title: widgetTitle });
        continue;
      }

      // 2. Click action rules (multi-rule)
      if (clickAction?.rules) {
        const ruleMatch = clickAction.rules.some(
          (r) => r.parameterMapping?.parameterName === parameterName
        );
        if (ruleMatch) {
          collisions.set(widget.id, { widgetId: widget.id, title: widgetTitle });
          continue;
        }
      }

      // 3. $param_xxx in query
      if (widget.query) {
        PARAM_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = PARAM_REGEX.exec(widget.query)) !== null) {
          if (match[1] === parameterName) {
            collisions.set(widget.id, { widgetId: widget.id, title: widgetTitle });
            break;
          }
        }
        if (collisions.has(widget.id)) continue;
      }

      // 4. Param-select parameterName
      if (widget.chartType === "parameter-select") {
        const opts = widget.settings?.chartOptions as Record<string, unknown> | undefined;
        if (opts?.parameterName === parameterName) {
          collisions.set(widget.id, { widgetId: widget.id, title: widgetTitle });
        }
      }
    }
  }

  return [...collisions.values()];
}
```

**Also update `collectParameterNames`** to scan `rules[]` for completeness (add between source 1 and source 2):

```typescript
// 1b. Click action rules (multi-rule)
if (clickAction?.rules) {
  for (const rule of clickAction.rules) {
    if (rule.parameterMapping?.parameterName) {
      names.add(rule.parameterMapping.parameterName);
    }
  }
}
```

**Run:** `cd app && npm test -- --run collect-parameter-names`

**Expected:** All tests PASS (both old `collectParameterNames` tests and new `findParameterCollisions` tests).

---

### Step 3: RED — Verify no collision banner exists yet (manual inspection)

Open the widget editor in a browser and confirm there is no info banner for parameter collisions. This is a manual verification step.

---

### Step 4: GREEN — Add collision banner to `widget-editor-modal.tsx`

**File:** `app/src/components/widget-editor-modal.tsx`

#### 4a. Add imports

Add `Info` to the lucide-react import:
```typescript
import { AlertCircle, AlertTriangle, Info, Play, FlaskConical } from "lucide-react";
```

Add `findParameterCollisions` to the existing import:
```typescript
import { collectParameterNames, findParameterCollisions } from "@/lib/collect-parameter-names";
```

#### 4b. Add collision computation (reactive `useMemo`)

After the existing `parameterSuggestions` memo (around line 157), add:

```typescript
// Collision detection: find other widgets using the same parameter name.
// For param-select: check `paramWidgetName`.
// For click-action widgets: check `parameterName` (legacy) and action rules.
const parameterCollisions = useMemo(() => {
  if (!layout || !widget?.id) return [];

  if (isParamSelect && paramWidgetName.trim()) {
    return findParameterCollisions(layout, widget.id, paramWidgetName.trim());
  }

  // For non-param-select widgets with click action enabled
  if (clickActionEnabled && parameterName.trim()) {
    return findParameterCollisions(layout, widget.id, parameterName.trim());
  }

  return [];
}, [layout, widget?.id, isParamSelect, paramWidgetName, clickActionEnabled, parameterName]);
```

**Note on `widget?.id`:** In add mode, `widget` is undefined, so `widget?.id` is undefined. We need a stable ID for the current widget. For add mode we can use a sentinel (empty string), since the widget doesn't exist in the layout yet and self-exclusion won't apply:

```typescript
const parameterCollisions = useMemo(() => {
  if (!layout) return [];

  const currentId = widget?.id ?? "";

  if (isParamSelect && paramWidgetName.trim()) {
    return findParameterCollisions(layout, currentId, paramWidgetName.trim());
  }

  if (clickActionEnabled && parameterName.trim()) {
    return findParameterCollisions(layout, currentId, parameterName.trim());
  }

  return [];
}, [layout, widget?.id, isParamSelect, paramWidgetName, clickActionEnabled, parameterName]);
```

#### 4c. Render the info banner in the parameter config area

**For param-select widgets:** Place the banner immediately after the `<ParameterConfigSection>` component (around line 957). Insert it inside the same `{isParamSelect && ( ... )}` block:

```tsx
{isParamSelect && (
  <>
    <ParameterConfigSection
      // ... existing props
    />
    {parameterCollisions.length > 0 && (
      <Alert variant="default" className="py-2 mt-3">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Shared parameter name</AlertTitle>
        <AlertDescription className="text-xs">
          The parameter &ldquo;{paramWidgetName}&rdquo; is also used by:{" "}
          {parameterCollisions.map((c) => c.title || "(untitled)").join(", ")}.
          Widgets sharing a parameter name will cross-filter each other.
        </AlertDescription>
      </Alert>
    )}
  </>
)}
```

**For click-action widgets:** Place a similar banner inside the Advanced tab's interactivity section, after the "Manage Action Rules" button (around line 1124). This shows the collision when the legacy single `parameterName` field is set:

```tsx
{clickActionEnabled && parameterCollisions.length > 0 && (
  <Alert variant="default" className="py-2 mt-3">
    <Info className="h-4 w-4" />
    <AlertTitle className="text-sm">Shared parameter name</AlertTitle>
    <AlertDescription className="text-xs">
      The parameter &ldquo;{parameterName}&rdquo; is also used by:{" "}
      {parameterCollisions.map((c) => c.title || "(untitled)").join(", ")}.
      Widgets sharing a parameter name will cross-filter each other.
    </AlertDescription>
  </Alert>
)}
```

**Placement rationale:** The banner appears directly below the parameter name input or the click action config, where the user just typed the name. It is contextually adjacent to the field that caused the collision. Using `variant="default"` (not `"destructive"`) because sharing a parameter name is informational, not an error.

---

### Step 5: REFACTOR — Lint and type-check

```bash
cd app && npx next lint --fix
npm run build
```

Ensure no lint errors or type errors.

---

### Step 6: E2E Test — Verify collision banner appears

**File:** `app/e2e/widget-states.spec.ts` (or `parameters.spec.ts`)

Add a test that:
1. Opens a dashboard with at least two widgets that share a parameter name.
2. Opens the widget editor for one of them.
3. Verifies the "Shared parameter name" info banner is visible.

```typescript
test("shows collision warning when parameter name is shared", async ({ page }) => {
  // Navigate to edit page of a dashboard that has two widgets sharing a parameter name.
  // (Setup may require creating widgets first via the UI or using an existing seeded dashboard.)

  // Open the widget editor for the first widget
  // ... (implementation depends on test helpers available)

  // Verify the collision banner
  await expect(
    page.getByText("Shared parameter name")
  ).toBeVisible();

  await expect(
    page.getByText(/is also used by/)
  ).toBeVisible();
});
```

**Note:** The exact E2E test setup depends on having two widgets with the same parameter name on a dashboard. This may require creating them in the test setup phase. The test body is straightforward once the dashboard is set up.

**Run:** `cd app && npx playwright test widget-states.spec.ts`

---

## Function Signature

```typescript
export interface ParameterCollision {
  widgetId: string;
  title: string;
}

export function findParameterCollisions(
  layout: DashboardLayoutV2,
  currentWidgetId: string,
  parameterName: string,
): ParameterCollision[];
```

**Parameters:**
- `layout` — The full dashboard layout (V2 format) containing all pages and widgets.
- `currentWidgetId` — The widget being edited. Excluded from results. Pass `""` for new widgets.
- `parameterName` — The parameter name to check for collisions. Returns `[]` if empty.

**Returns:** Array of `{ widgetId, title }` for each widget (other than the current one) that references the given parameter name via any of the four sources.

---

## Bonus: Update `collectParameterNames` to scan rules

While implementing `findParameterCollisions`, also add rules scanning to the existing `collectParameterNames` function. This is a bugfix/improvement: currently, parameter names set via click action rules are not included in the suggestions list.

Add between the existing source 1 (click action parameterMapping) and source 2 ($param_xxx):

```typescript
// 1b. Click action rules (multi-rule parameterMapping)
if (clickAction?.rules) {
  for (const rule of clickAction.rules) {
    if (rule.parameterMapping?.parameterName) {
      names.add(rule.parameterMapping.parameterName);
    }
  }
}
```

This ensures the `parameterSuggestions` autocomplete in the widget editor also includes parameter names from multi-rule click actions.

---

## Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| **Existing widgets, no collision** | No banner shown. Zero visual change. |
| **Existing widgets, shared parameter name** | Info banner appears when editing. Informational only — no save blocking. |
| **New widget (add mode)** | Banner appears as soon as a parameter name is typed that matches another widget. |
| **Lab mode (template editing)** | `layout` is not passed in lab mode (`layout` is `undefined`), so `parameterCollisions` is always `[]`. No banner shown. Correct: templates are not dashboard-scoped. |

---

## Security Checklist

- [x] **No query modification:** `findParameterCollisions` only reads layout metadata. No queries constructed.
- [x] **No credential exposure:** No new credential handling.
- [x] **Tenant isolation:** Function operates on the client-side layout object already scoped to the user's dashboard. No cross-tenant data access.
- [x] **XSS:** Collision info displayed via React JSX (built-in escaping). No `dangerouslySetInnerHTML`.
- [x] **No new API endpoints:** All logic is client-side.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Performance on very large dashboards (100+ widgets) | Low | Negligible | `findParameterCollisions` is O(W) where W = widget count. Memoized with `useMemo`. |
| Collision banner is distracting for intentional parameter sharing | Low | Low UX | Use `variant="default"` (info-level), not destructive. Banner text clarifies this is informational. |
| Missing `widget?.id` in add mode causes false negatives | Low | None | Using `""` as sentinel; new widgets don't exist in the layout yet, so there's nothing to self-exclude. |
| `collectParameterNames` rules scanning change affects existing behavior | Low | None | Only additive — new parameter names appear in suggestions that were previously missing. |

---

## Checklist

- [ ] Write failing tests for `findParameterCollisions` (8 test cases)
- [ ] Run tests, confirm RED (`findParameterCollisions` not exported)
- [ ] Implement `findParameterCollisions` in `collect-parameter-names.ts`
- [ ] Add rules scanning to `collectParameterNames` (bonus improvement)
- [ ] Run tests, confirm GREEN
- [ ] Add `Info` icon import to `widget-editor-modal.tsx`
- [ ] Add `findParameterCollisions` import to `widget-editor-modal.tsx`
- [ ] Add `parameterCollisions` useMemo to `widget-editor-modal.tsx`
- [ ] Add collision banner for param-select parameter name
- [ ] Add collision banner for click-action parameter name (Advanced tab)
- [ ] Run `cd app && npx next lint --fix`
- [ ] Run `npm run build` (type-check)
- [ ] Run `cd app && npm test` (all app unit tests pass)
- [ ] Add E2E test for collision banner visibility
- [ ] Run `cd app && npx playwright test` (E2E passes)
