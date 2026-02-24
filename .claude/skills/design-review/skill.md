# Design Review — NeoBoard Design Taste Document

Extracted from the actual codebase. Not aspirational — this IS the system.

## When to Use

Before touching ANY UI code (pages, components, layouts, modals), read this document. After any visual change, compare against these patterns. Flag deviations in PR descriptions.

---

## 1. Visual Hierarchy

### Elevation Stack (low to high)
1. **Page background**: `bg-background` (white / `hsl(0 0% 100%)`)
2. **Cards**: `bg-card` + `shadow` + `rounded-xl border` — cards float above page
3. **Overlays**: `bg-background/80 backdrop-blur-sm` + `shadow-md` — semi-transparent blur
4. **Dialogs**: `bg-background` + `shadow-lg` on overlay `bg-black/80` — highest z-level
5. **Tooltips**: `bg-primary text-primary-foreground` — inverted colors, no explicit shadow

### Z-Index Layers
- Sidebar: normal flow (no z-index)
- Dropdowns/Popovers: z-50 (Radix default)
- Dialog overlay: z-50 `fixed inset-0`
- Toasts: z-[100] (Sonner default)

### Active/Selected States
- Sidebar active: `bg-accent text-accent-foreground`
- Tab active: `border-b-2 border-primary text-foreground` (bottom border emphasis)
- Connection card active: `border-primary` ring
- Selection in lists: `bg-accent/50`

---

## 2. Spacing & Density

### The Rules
- **Page root padding**: `p-6` — ALWAYS. Every `(dashboard)` page uses this.
- **Section gaps**: `space-y-4` between major sections, `gap-4` in grids.
- **Form field gaps**: `space-y-2` between label+input groups.
- **Card padding**: `p-6` is the standard (CardHeader, CardContent, CardFooter).
- **Inline element gaps**: `gap-2` between buttons, badges, icons.

### Known Deviations (Intentional)
- `WidgetCard`: Uses `p-4 pb-2` header / `p-4 pt-2` content — INTENTIONALLY denser because widgets are packed in a grid. This is the "compact card" pattern.
- `ConnectionCard`: Uses `p-4` — also compact, for list density.

### Anti-Pattern: DO NOT
- Use `p-3` or `p-5` — they break the 4/6 rhythm.
- Use `gap-1` for button groups — too tight. Use `gap-2`.
- Mix `space-y-2` and `space-y-3` in the same form — pick one per form.
- Add `p-8` or larger — nothing in the codebase uses this, it'll look out of place.

---

## 3. Color Usage

### Semantic Color Map (CSS Variables, HSL)
| Token | Light | Usage |
|-------|-------|-------|
| `--background` | `0 0% 100%` (white) | Page backgrounds |
| `--foreground` | `0 0% 3.9%` (near-black) | Body text |
| `--card` | `0 0% 100%` (white) | Card surfaces |
| `--muted` | `0 0% 96.1%` (light gray) | Disabled bgs, secondary surfaces |
| `--muted-foreground` | `0 0% 45.1%` (medium gray) | Captions, metadata, descriptions |
| `--primary` | `0 0% 9%` (near-black) | Buttons, active states |
| `--secondary` | `0 0% 96.1%` (light gray) | Secondary buttons |
| `--destructive` | `0 84.2% 60.2%` (red) | Delete buttons, error states |
| `--border` | `0 0% 89.8%` (light gray) | All borders |
| `--input` | `0 0% 89.8%` (light gray) | Input borders |
| `--ring` | `0 0% 3.9%` (near-black) | Focus rings |

### Chart Colors (5-color palette)
```
--chart-1: hsl(12, 76%, 61%)   // orange
--chart-2: hsl(173, 58%, 39%)  // teal
--chart-3: hsl(197, 37%, 24%)  // dark blue
--chart-4: hsl(43, 74%, 66%)   // yellow
--chart-5: hsl(27, 87%, 67%)   // warm orange
```
Dark mode uses different chart colors (blues, greens, purples).

### Color Rules
- NEVER use raw hex/hsl values in components. Always use CSS variable tokens.
- Opacity modifiers allowed: `/80`, `/60`, `/50` for overlays and hover states.
- Role badges: admin = `destructive` (red), creator = `default` (blue), reader = `secondary` (gray).
- Connection status: connected = implicit (no color), error = `destructive`, connecting = neutral.
- `text-muted-foreground` is the workhorse for secondary text (50 occurrences in component lib).

---

## 4. Chart Styling

### ECharts Integration Pattern
- Colors resolved at runtime from CSS variables via `resolveChartColors()` in `base-chart.tsx`.
- Fallback array exists for SSR: `CHART_COLORS_FALLBACK`.
- NO custom ECharts theme registered — all styling via option merging.

### Chart Defaults
```typescript
// Bar/Line chart grid (standard)
grid: { left: 16, right: 16, top: 16, bottom: 24, containLabel: true }

// Compact mode (container < 300px)
grid: { left: 8, right: 8, top: 8, bottom: 8 }

// Legend position
legend: { bottom: 0 }  // ALWAYS bottom-aligned

// Tooltip
tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }
```

### Chart Anti-Patterns
- NEVER import `import * as echarts from 'echarts'` — use modular imports from `echarts/core`.
- NEVER set chart colors inline — always use `resolveChartColors()`.
- NEVER add title inside the chart — widget card header IS the title.
- NEVER use ECharts' built-in theme — we control colors via CSS variables.
- Dark mode chart colors are DIFFERENT from light mode — this is by design.

### Graph Chart (NVL)
- Force-directed default layout.
- Supports: circular, hierarchical layouts via dropdown.
- Context menu: right-click for expand/collapse neighbors.
- Status bar shows node/edge counts.
- Loading via NVL's built-in loading state.

---

## 5. Typography Scale

### The Actual Scale Used
| Class | Size | Weight | Where Used |
|-------|------|--------|------------|
| `text-xs` | 12px | `font-medium` | Labels, badges, captions, metadata timestamps |
| `text-sm` | 14px | `font-medium` | **DOMINANT** — body text, form labels, descriptions, buttons, menu items |
| `text-base` | 16px | normal | Input text (rendered content) |
| `text-lg` | 18px | `font-semibold` | Page titles, dialog headers, card titles |

### Weight Rules
- `font-medium` (500): Default for interactive elements (buttons, links, nav items) — 38 occurrences.
- `font-semibold` (600): Section headings, card titles, emphasis — 13 occurrences.
- `font-bold` (700): Rare. Only metric values and strong emphasis — 4 occurrences.
- Default (400): Body text, descriptions, form help text.

### Typography Anti-Patterns
- DO NOT use `text-2xl` or `text-3xl` — nothing in the codebase uses them. The scale stops at `text-lg`.
- DO NOT use `font-bold` for headings — use `font-semibold`. Bold is reserved for metric emphasis.
- Card titles: `font-semibold leading-none tracking-tight` (from CardTitle). Match this exactly.
- Descriptions always: `text-sm text-muted-foreground` (from CardDescription).

---

## 6. Border & Radius Patterns

### Border Radius Hierarchy
| Class | Computed | Where Used |
|-------|----------|------------|
| `rounded-xl` | 12px | Card base ONLY |
| `rounded-lg` | 8px (`var(--radius)`) | Dialogs (`sm:rounded-lg`), popovers |
| `rounded-md` | 6px | **DOMINANT** — buttons, inputs, selects, menu items (40 occurrences) |
| `rounded-sm` | 4px | Compact elements, close buttons, tiny controls |
| `rounded-full` | 9999px | Avatars, status dots, toggle switches, badges |

### Border Rules
- Standard border: `border border-border` (1px, light gray) for most elements.
- Active emphasis: `border-2 border-primary` (2px, black) for selected items (connection type picker).
- Tab active: `border-b-2 border-primary` (bottom-only 2px).
- Separators: `border-t` for horizontal dividers between sections.
- NEVER use `border-4` — only 1 occurrence exists and it's anomalous.

### Shadow Scale
| Class | Where Used |
|-------|------------|
| `shadow-sm` | Buttons (outline, secondary, destructive), inputs — subtle elevation |
| `shadow` | Card base, default button — standard card elevation |
| `shadow-md` | Floating menus, graph overlay — mid-elevation |
| `shadow-lg` | Popovers, dropdowns — high elevation overlays |

---

## 7. Component Patterns

### Dialog Sizing Progression
```
sm   → max-w-[425px]  — Simple confirmations
md   → max-w-lg       — Standard forms (DEFAULT)
lg   → max-w-[700px]  — Multi-section forms
xl   → max-w-[900px]  — Complex editors
full → max-w-[calc(100vw-2rem)] — Fullscreen views
```
Widget editor uses: `sm:max-w-md` (step 1) → `sm:max-w-6xl` (step 2).

### Button Usage Patterns
- Primary actions (Save, Create): `variant="default"` (black bg)
- Cancel/Close: `variant="outline"`
- Destructive (Delete): `variant="destructive"` (red bg)
- Toolbar actions: `variant="ghost" size="icon"` or `variant="ghost" size="sm"`
- Inline/subtle: `variant="ghost"` with icon
- In widget cards: `variant="ghost" size="icon" className="h-8 w-8"` (custom smaller)

### Empty State Pattern
Always use the `EmptyState` component from component lib:
- Icon (optional): Lucide icon, muted color
- Title: `text-lg font-semibold`
- Description: `text-sm text-muted-foreground`
- Action button (optional): Primary variant

### Loading Patterns
- Page load: `useSession({ required: true })` shows loading spinner in layout
- Button loading: `LoadingButton` with `loading` prop, shows spinner + text
- Data fetching: skeleton placeholders (not yet widely implemented)
- Chart loading: ECharts internal loading indicator
- Overlay: `LoadingOverlay` component for full-container blocking loads

---

## 8. Responsive Grid

### Dashboard Card Grid
```
grid gap-4 sm:grid-cols-2 lg:grid-cols-3
```
- Mobile (< 640px): 1 column
- Tablet (640-1023px): 2 columns
- Desktop (1024px+): 3 columns

### Dashboard Widget Grid (react-grid-layout)
```
lg: 1200px → 12 columns
md: 996px  → 10 columns
sm: 768px  → 6 columns
xs: 480px  → 4 columns
```
Resize handle: southeast corner only.

### Form Grids
```
grid gap-4 sm:grid-cols-2  // Connection form: stacked on mobile, 2-col on tablet+
grid grid-cols-2 gap-4     // Type picker: always 2-col
```

---

## 9. Consistency Checklist

Before submitting any UI PR, verify:

- [ ] Page root uses `p-6`
- [ ] Cards use standard `p-6` padding (or `p-4` only for compact widget/connection cards)
- [ ] Text hierarchy: `text-lg` for titles, `text-sm` for body, `text-xs` for metadata
- [ ] Descriptions use `text-sm text-muted-foreground`
- [ ] Interactive elements have `text-sm font-medium`
- [ ] Buttons use correct variant (default=primary, outline=cancel, destructive=delete, ghost=toolbar)
- [ ] Form fields use `space-y-2` internal spacing
- [ ] Section gaps use `space-y-4`
- [ ] Colors reference CSS variable tokens, never raw values
- [ ] Charts use `resolveChartColors()`, never inline colors
- [ ] Border radius matches component type (xl=cards, md=buttons/inputs, full=circles)
- [ ] Empty states use the `EmptyState` component
- [ ] Loading states use `LoadingButton` or `LoadingOverlay`
