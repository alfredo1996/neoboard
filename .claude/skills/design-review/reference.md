# Design review — full reference

The flat-panel system (epic #2210; widget panels from #2219). Tokens landed in #2215; components are restyled in the issues after it, so a component may still carry the old look until its issue merges.

## When to Use

`SKILL.md` in this directory holds the rules. This file is the full system behind them: every token table, the chart palettes, dialog and grid sizes, and the critique format. `design-reviewer` reads both.

---

## 1. Visual Hierarchy

### One surface, not an elevation stack

1. **Page**: `bg-background`. `--card` and `--surface` are the same colour, so outside the dashboard nothing floats above the page.
2. **Dashboard**: widgets are flat panels (`--card` fill, 1px `--rule` border, 8px radius, no shadow), 12px apart in view and edit, on `--ground`. A hovered or focused panel tints to `--panel-hover` (#2219). Panels touching with shared 1px gutters (the ruled sheet) were rejected: they read as one giant table.
3. **Rules**: areas are separated by a 1px hairline (`border-border` = `--rule`; `--rule-strong` for an emphasised divider). Whitespace first, a rule second, a container last.
4. **Side**: `--side` for the sidebar and rails.
5. **Field**: `--field` fills inputs and overlays (white in light, a step lighter than the page in dark).
6. **Overlays**: popovers, dropdowns, dialogs and toasts are the only things with a shadow (`shadow-md` menus, `shadow-lg` dialogs).
7. **Tooltips**: `bg-primary text-primary-foreground` — inverted colours.

### Z-Index Layers

- Sidebar: normal flow (no z-index)
- Dropdowns/Popovers: z-50 (Radix default)
- Dialog overlay: z-50 `fixed inset-0`
- Toasts: z-[100] (Sonner default)

### Active/Selected States

- Sidebar active: `border-l-2 border-[hsl(var(--ring))] bg-accent-soft text-foreground` — the rail is the signal, the fill is neutral in dark (#1244)
- Tab active: `border-b-2 border-primary text-foreground` (bottom border emphasis)
- Connection card active: `border-primary` ring
- Selection in lists: `bg-accent/50`

---

## 2. Spacing & Density

### The Rules

- **Page root padding**: `p-6`, every `(dashboard)` page.
- **Section gaps**: `space-y-4` between major sections, `gap-4` in grids.
- **Form field gaps**: `space-y-2` between label+input groups.
- **No `p-6` card around a section.** A block is set off by whitespace and a hairline rule. A bordered container is for a widget, which the user moves and resizes.
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

### Semantic Color Map (CSS variables, bare HSL channels)

| Token                               | Light                       | Dark                    | Usage                                                                                               |
| ----------------------------------- | --------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `--background`                      | `240 20% 99%` (#FCFCFD)     | `220 13% 9%` (#14161A)  | Page; `--card` and `--surface` equal it                                                             |
| `--side`                            | `220 16% 96%` (#F3F4F6)     | `218 14% 11%` (#181B20) | Sidebar, rails; `--muted` equals it in light                                                        |
| `--ground`                          | `220 16% 95%`               | `220 13% 6%`            | Dashboard area behind the panels (#2219)                                                            |
| `--panel-hover`                     | `212 80% 97.5%`             | `218 14% 13%`           | Hovered or focused panel; stays visibly off the ground (#2219)                                      |
| `--foreground`                      | `223 14% 10%` (#16181D)     | `216 15% 94%` (#EDEFF2) | Ink: body text, titles                                                                              |
| `--foreground-2`                    | `222 11% 36%` (#525866)     | `217 11% 71%` (#ADB3BD) | Ink 2: secondary text                                                                               |
| `--muted-foreground`                | `220 8% 44%` (#676D79)      | `219 9% 62%` (#959BA7)  | Ink 3: captions, metadata                                                                           |
| `--rule` / `--border`               | `220 12% 91%` (#E5E7EB)     | `218 13% 17%` (#262A31) | Hairline rules, all default borders                                                                 |
| `--rule-strong` / `--border-strong` | `216 11% 82%` (#CCD0D6)     | `219 11% 25%`           | Emphasised dividers (about 1.5:1: decoration, never a control edge)                                 |
| `--field`                           | `0 0% 100%`                 | `218 13% 12%` (#1B1E23) | Input and overlay fill                                                                              |
| `--input`                           | `219 8% 56%` (#868C98)      | `218 9% 43%` (#646B78)  | Field border: 3.29:1 light, 3.38:1 dark on the page, and at least 3:1 on `--side` too (WCAG 1.4.11) |
| `--primary`                         | `220 13% 9%` (graphite)     | near-white              | Buttons, active states                                                                              |
| `--destructive`                     | `0 72% 45%` (red)           | lifted red              | Delete buttons, error states                                                                        |
| `--ring`                            | `212 90% 42%` (azure)       | `212 90% 62%`           | Focus rings, active rail, selection (#1553)                                                         |
| `--accent`                          | `212 100% 95%` (azure tint) | `212 45% 21%`           | Hover/selected fill; the menu highlight is the inset `--ring` stroke (#1559)                        |
| `--brand`                           | `38 95% 55%` (citrine)      | `38 95% 58%`            | Wordmark mark                                                                                       |

`graphite-citrine-tokens.test.ts` computes the ratios: ink, ink 2 and ink 3 hold 4.5:1 on the page and on `--side`; the ring and the field border hold 3:1 on both, in both themes.

### Chart Colors (10-color "Graphite & Citrine" default palette — colorblind-safe)

```css
/* Light mode (values are `H S% L%` for hsl(var(--chart-N))) */
--chart-1: 38 95% 55%; /* Citrine (brand-led lead series) */
--chart-2: 185 70% 48%; /* Teal */
--chart-3: 265 55% 48%; /* Purple */
--chart-4: 350 70% 48%; /* Rose */
--chart-5: 95 45% 66%; /* Green */
--chart-6: 330 65% 38%; /* Wine */
--chart-7: 240 55% 66%; /* Indigo */
--chart-8: 15 75% 58%; /* Orange */
--chart-9: 172 65% 38%; /* Deep teal */
--chart-10: 150 55% 66%; /* Mint */
```

Dark mode uses the same hues with higher lightness for contrast on dark backgrounds.
Ordering maximises sequential contrast: the first 5 span Citrine → Teal → Purple → Rose → Green so typical 2–5-series charts are always distinguishable. The lead series is the citrine brand hue. Similar hues (e.g. the two teals, the two greens) are placed far apart.

### Color Rules

- NEVER use raw hex/hsl values in components. Always use CSS variable tokens.
- Opacity modifiers allowed: `/80`, `/60`, `/50` for overlays and hover states.
- Role badges: admin = `destructive` (red), creator = `default` (graphite), reader = `secondary` (gray).
- Connection status: connected = implicit (no color), error = `destructive`, connecting = neutral.
- `text-muted-foreground` is the workhorse for secondary text (50 occurrences in component lib).

---

## 4. Chart Styling

### ECharts Integration Pattern

- Colors resolved at runtime from CSS variables via `resolveChartColors()` in `base-chart.tsx`.
- Fallback array exists for SSR: `CHART_COLORS_FALLBACK` (citrine light palette).
- Two registered ECharts themes: `neoboard-light` and `neoboard-dark` (registered once at module load via `registerNeoboardThemes()`). Themes set axis, label, legend, and split-line colors for each mode.
- Dark mode detection via `MutationObserver` on `<html class="dark">` — charts reinitialize on theme toggle.
- Loading mask adapts to dark mode: `rgba(10, 15, 30, 0.6)` dark / `rgba(255, 255, 255, 0.6)` light.

### Chart Defaults

```typescript
// Bar/Line chart grid (standard)
grid: { left: 16, right: 16, top: 16, bottom: 24, containLabel: true }

// Compact mode (container < 300px)
grid: { left: 8, right: 8, top: 8, bottom: 8 }
// Compact drops the axis NAME and the value-axis numbers. Category labels
// stay — truncated to 10 chars under 400px — because a chart with no
// category names identifies nothing (#1247).

// Gridlines: one weight and colour for every cartesian chart, from the
// registered theme (GRID_LINE_COLOR in charts/theme.ts). Charts set only
// `splitLine: { show }` — never `splitLine.lineStyle`.

// Legend position
legend: { bottom: 0 }  // ALWAYS bottom-aligned

// Tooltip
tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }
```

### Chart Anti-Patterns

- NEVER import `import * as echarts from 'echarts'` — use modular imports from `echarts/core`.
- NEVER set chart colors inline — always use `resolveChartColors()`.
- NEVER add title inside the chart — widget card header IS the title.
- NEVER register additional ECharts themes — use `neoboard-light` / `neoboard-dark` only.
- NEVER set `splitLine.lineStyle` in a chart module — gridline weight belongs to the theme (#1247).
- NEVER let a responsive breakpoint hide category labels — degrade to truncation, not to nothing (#1247).
- Dark mode chart colors are DIFFERENT from light mode — this is by design (higher lightness for contrast).

### Graph Chart (NVL)

- Force-directed default layout.
- Supports: circular, hierarchical layouts via dropdown.
- Context menu: right-click for expand/collapse neighbors.
- Status bar shows node/edge counts.
- Loading via NVL's built-in loading state.

---

## 5. Typography Scale

### Faces

| Token / class                                                 | Face                     | Used for                                        |
| ------------------------------------------------------------- | ------------------------ | ----------------------------------------------- |
| `--font-serif` / `font-serif`                                 | Source Serif 4           | Page titles and the wordmark only               |
| `--font-body`, `--font-display` / `font-body`, `font-display` | IBM Plex Sans            | Everything else, tabular figures on at the root |
| `--font-mono` / `font-mono`                                   | IBM Plex Mono (400, 500) | Code, query text, keyboard hints                |

All three are self-hosted woff2 in `component/fonts/` (OFL-1.1); nothing loads from a network URL (#1683).

### The scale

| Role         | Size / weight | Face  |
| ------------ | ------------- | ----- |
| Page title   | 36 / 600      | serif |
| Stat         | 36 / 600      | sans  |
| Section      | 15 / 600      | sans  |
| Body         | 14            | sans  |
| Widget title | 13 / 600      | sans  |
| Meta         | 12            | sans  |

### Weight rules

- `font-medium` (500): interactive elements (buttons, links, nav items).
- `font-semibold` (600): titles and section headings.
- Default (400): body text, descriptions, help text.
- Never `font-bold`.

### Typography anti-patterns

- Serif outside a page title or the wordmark.
- A size between the scale's steps, or a second heading style.
- Inter, Geist or any face other than the three above.
- A description that restates the title next to it.
- Monospace as "technical" styling: use it only for real code and query text.

---

## 6. Border & Radius Patterns

### Radius

| Role                                            | Radius                    | Class              |
| ----------------------------------------------- | ------------------------- | ------------------ |
| Controls (buttons, inputs, selects, menu items) | 6px (`--radius-sm`)       | `rounded-sm`       |
| Panels (widgets)                                | 8px (`--radius-md`)       | `rounded-md`       |
| Overlays (popovers, dialogs, toasts)            | 10px (`--radius-overlay`) | `rounded-overlay`  |
| Checkbox                                        | 4px (`--radius-checkbox`) | `rounded-checkbox` |
| Pills, avatars, status dots                     | 9999px (`--radius-pill`)  | `rounded-full`     |

`--radius-lg` (12px) is the pre-redesign card radius. Widget panels left it in #2219; it goes when its last user migrates. All values are pinned in `graphite-citrine-tokens.test.ts`; check there before quoting a number.

### Type scale utilities

`text-title` (36/1.1/600, add `font-serif`), `text-stat` (36/1/600), `text-section` (15/600), `text-body` (14), `text-widget-title` (13/600) and `text-meta` (12) are in the Tailwind preset. `text-h1` to `text-h3` remain only for the card stat and markdown headings until those components migrate.

### Border Rules

- Standard border: `border border-border` (1px, light gray) for most elements.
- Active emphasis: `border-2 border-primary` (2px, black) for selected items (connection type picker).
- Tab active: `border-b-2 border-primary` (bottom-only 2px).
- Separators: `border-t` for horizontal dividers between sections.
- NEVER use `border-4` — only 1 occurrence exists and it's anomalous.

### Shadows

Only overlays carry a shadow: `shadow-md` for menus and popovers, `shadow-lg` for dialogs. Panels, buttons and inputs have none; a border and the gap between panels do that job. A shadow on anything else is a red flag.

---

## 7. Component Patterns

### Dialog Sizing Progression

```text
sm   → max-w-[425px]  — Simple confirmations
md   → max-w-lg       — Standard forms (DEFAULT)
lg   → max-w-[700px]  — Multi-section forms
xl   → max-w-[900px]  — Complex editors
full → max-w-[calc(100vw-2rem)] — Fullscreen views
```

Widget editor uses: `sm:max-w-md` (step 1) → `sm:max-w-6xl` (step 2).

### Button Usage Patterns

- Primary actions (Save, Create): `variant="default"` (graphite bg)
- Cancel/Close: `variant="outline"`
- Destructive (Delete): `variant="destructive"` (red bg)
- Toolbar actions: `variant="ghost" size="icon"` or `variant="ghost" size="sm"`
- Inline/subtle: `variant="ghost"` with icon
- In widget cards: `variant="ghost" size="icon" className="h-8 w-8"` (custom smaller)

### Empty State Pattern

Always use the `EmptyState` component from component lib:

- Icon (optional): Lucide icon, muted color
- Title: section size (15/600)
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

```text
grid gap-4 sm:grid-cols-2 lg:grid-cols-3
```

- Mobile (< 640px): 1 column
- Tablet (640-1023px): 2 columns
- Desktop (1024px+): 3 columns

### Dashboard Widget Grid (react-grid-layout)

```text
lg: 1200px → 12 columns
md: 996px  → 10 columns
sm: 768px  → 6 columns
xs: 480px  → 4 columns
```

Resize handle: southeast corner only.

### Form Grids

```text
grid gap-4 sm:grid-cols-2  // Connection form: stacked on mobile, 2-col on tablet+
grid grid-cols-2 gap-4     // Type picker: always 2-col
```

---

## 9. Consistency Checklist

Before submitting any UI PR, verify:

- [ ] Page root uses `p-6`
- [ ] Widgets are flat panels 12px apart on `--ground`; elsewhere one surface with hairline rules; no `p-6` card around a section; shadows only on overlays
- [ ] Type from the scale; serif only for the page title and wordmark
- [ ] Descriptions use `text-sm text-muted-foreground` and say something the title does not
- [ ] Interactive elements have `text-sm font-medium`
- [ ] Buttons use correct variant (default=primary, outline=cancel, destructive=delete, ghost=toolbar)
- [ ] Form fields use `space-y-2` internal spacing; section gaps use `space-y-4`
- [ ] Colours reference CSS variable tokens, never raw values; field borders use `--input`
- [ ] Charts use `resolveChartColors()`, never inline colors
- [ ] Radius matches the role: controls 6, panels 8, overlays 10, checkbox 4
- [ ] Empty states use `EmptyState`; loading states use `LoadingButton` or `LoadingOverlay`
- [ ] Checked in light and dark

---

## 10. Anti-Patterns — Red Flags

These are the fingerprints of careless or AI-generated UI work. Flag immediately in reviews.

### Layout Anti-Patterns

- **Nested cards**: Cards inside cards create visual noise — flatten the hierarchy
- **Shadows off overlays**: a shadow on a panel, button or input
- **Panels with no gap**: widgets sharing 1px gutters read as one giant table; the owner rejected that ruled sheet in #2219
- **Everything in cards**: Not every element needs a container — use whitespace and grouping instead
- **Identical card grids**: Same-sized cards with icon + heading + text, repeated endlessly — vary the layout
- **Everything centered**: Left-aligned text with asymmetric layouts feels more intentional
- **Same spacing everywhere**: No rhythm — use tight groupings near related elements, generous separations between sections
- **Modal overuse**: Modals when inline expansion, drawer, or page navigation would work better

### Color Anti-Patterns

- **Gray text on colored backgrounds**: Looks washed out — use a tinted shade of the background color or transparency instead
- **Pure black/white**: `#000` or `#fff` never appear in nature — always use the semantic tokens (`--foreground`, `--background`)
- **Hard-coded hex/hsl**: Bypasses theming and dark mode — use CSS variable tokens
- **Gradient text on metrics**: Decorative, not meaningful — plain colored text is clearer
- **Neon accents on dark backgrounds**: The "AI color palette" — cyan, purple-to-blue gradients

### Typography Anti-Patterns

- **Wrong face**: Inter, Geist, Roboto, Arial, or serif anywhere except a page title and the wordmark (the three faces are IBM Plex Sans, Source Serif 4, IBM Plex Mono)
- **Monospace as "technical" vibes**: Lazy shorthand — use it only for actual code/query content
- **Big icons above headings**: Rounded-corner icons above every section title — rarely adds value, looks templated

### Motion Anti-Patterns

- **Bounce/elastic easing**: Feels dated — use smooth deceleration (ease-out)
- **Animating layout properties**: width, height, padding, margin cause layout thrashing — use transform and opacity only
- **Glassmorphism everywhere**: Blur effects and glass cards used decoratively rather than purposefully

### Copy Anti-Patterns

- **Redundant headers**: Title that restates the page name, description that repeats the heading, a subtitle that restates the title
- **Every button is primary**: Use ghost, outline, secondary — hierarchy matters
- **Generic error messages**: "Error occurred" — say what happened and how to fix it

---

## 11. Design Critique Format

For ad-hoc design feedback. The `design-reviewer` agent reports in its own output format, which takes precedence.

When reviewing UI changes, structure feedback as:

### Overall Impression

One-sentence gut reaction — what works, what doesn't.

### What's Working

2-3 things done well and why they work. Be specific.

### Priority Issues (top 3-5)

For each:

- **What**: Name the problem
- **Why it matters**: Impact on users
- **Fix**: Concrete recommendation
- **Reference**: Which section of this document it violates

### Minor Observations

Quick notes on smaller issues.

### Questions to Consider

Provocative questions that might unlock better solutions:

- "Does this need to feel this complex?"
- "What would a more confident version look like?"
- "Is the primary action obvious within 2 seconds?"
