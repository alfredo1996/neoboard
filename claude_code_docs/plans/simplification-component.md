# Component Package — Code Quality & Simplification Analysis

**Date:** 2026-03-20
**Package:** `component/` (123 source files)
**Verdict:** Well-architected. Minor issues only.

---

## Architecture Boundary Violations

**PASS** — No imports from `app/` or `connection/`. No business logic, API calls, or store usage.

---

## Findings

### HIGH — Hardcoded Colors Instead of Design Tokens (3 files)

Colors are scattered as raw Tailwind classes instead of semantic tokens. If the design system changes, every file needs manual updates.

| File | Lines | Details |
|------|-------|---------|
| `field-picker.tsx` | 18-24 | `typeColors` map: 5 type variants with hardcoded `bg-blue-100`, `bg-green-100`, etc. |
| `connection-status.tsx` | 20-23 | `statusConfig` with 4 status states: `bg-green-500`, `bg-gray-400`, `bg-yellow-500`, `bg-red-500` |
| `dashboard-mini-preview.tsx` | 18-28 | `chartTypeColors` with 8 chart types: `bg-blue-400/40`, `bg-green-400/40`, etc. |
| `json-viewer.tsx` | 24-28 | Syntax highlighting: `text-green-600`, `text-blue-600`, `text-purple-600` |
| `map-chart.tsx` | 177-178 | Marker default: hardcoded `#3b82f6` hex |
| `form-widget.tsx` | 55 | Success message: `text-green-600 dark:text-green-400` |

**Recommendation:** Extract to a shared `design-tokens.ts` or use CSS custom properties via Tailwind theme extension.

---

### MEDIUM — Date Parsing/Formatting Duplication (2 files)

Identical date parsing logic copy-pasted between two parameter widgets.

**File 1:** `parameter-widgets/date-picker.tsx` (lines 40-55)
**File 2:** `parameter-widgets/date-range-picker.tsx` (lines 54-84)

Duplicated code:
```typescript
// Parsing (identical in both files)
const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
if (!match) return undefined;
const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
return Number.isNaN(date.getTime()) ? undefined : date;

// Formatting (identical in both files)
[date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
```

**Fix:** Create `lib/date-utils.ts` with `parseIsoDate()` and `formatIsoDate()`.

---

### LOW — Missing Test for code-preview.tsx

`components/composed/code-preview.tsx` has no corresponding test file. Small component but affects the 80% coverage target.

---

## Non-Issues (Verified Clean)

| Area | Status | Notes |
|------|--------|-------|
| Component nesting | PASS | Deepest nesting is 3-4 levels in tables/charts — appropriate |
| God components | PASS | Largest is chart-options-panel (~230 lines) — reasonable |
| Props drilling | PASS | Good composition patterns, render props used appropriately |
| TypeScript | PASS | All `any` usage is justified with comments (CodeMirror opaque types, vendored code) |
| Memoization | PASS | `useMemo` used in chart-options-panel, base-chart, markdown-widget |
| Bundle size | PASS | Heavy deps (NVL, Leaflet, CodeMirror) lazy-loaded by app/ layer |
| Accessibility | PASS | Proper ARIA labels, semantic HTML, `sr-only` text throughout |
| Security | PASS | Markdown escaping, iframe sandbox allowlist, URL validation |
| Dead code | PASS | No unused exports or commented-out blocks found |
| Error boundaries | N/A | Correctly delegated to app/ layer |
| Loading states | PASS | Charts have `loading` prop, params have skeleton, forms have `isSubmitting` |

---

## Summary

The component package is the cleanest of the three. Only actionable items:

1. Extract hardcoded colors to design tokens (consistency risk)
2. Deduplicate date parsing utilities (minor DRY violation)
3. Add test for code-preview.tsx (coverage gap)
