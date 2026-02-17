# Task 5: UX Design System & Color Palette

> **Source**: NOTES.md item #5
> **Priority**: Medium — visual polish and brand identity
> **Dependencies**: None

---

## Problem Statement

NeoBoard currently uses the default shadcn/ui color scheme. The application needs:
1. A distinctive, professional color palette for a data visualization tool
2. Consistent design tokens across light and dark modes
3. A chart color palette that works well for data visualization
4. Investigation of available tools/skills for UX design (Figma integration)

---

## Anthropic Skills Assessment

The Anthropic skills repository at `github.com/anthropics/skills` contains skills for Claude-powered development. For UX/design work:

- **No Figma skill exists** — Figma integration is not available through Claude skills
- Skills are focused on code generation, not visual design tools
- For UX design, the recommended approach is:
  - Use Claude to generate UI components directly (which we're already doing)
  - Create Storybook stories as a living design system (already in place)
  - Use Figma independently for mockups, then implement with Claude

### Alternative Approach for UX Design

Instead of Figma, leverage what we already have:
1. **Storybook** — the component library already has Storybook set up. Use it as the design system documentation.
2. **shadcn/ui theming** — customize CSS variables for the color palette
3. **Tailwind config** — extend the theme with custom colors

---

## Proposed Color Palette

### Design Philosophy

For a dashboard/data visualization tool:
- **Dark mode first** — most users prefer dark mode for data-heavy interfaces
- **Low-contrast backgrounds** — reduce eye strain for long sessions
- **High-contrast data colors** — charts must pop against the background
- **Blue-primary** — trustworthy, professional, common in analytics tools
- **Semantic colors** — green (success/connected), red (error), amber (warning)

### Primary Palette: "Deep Ocean"

```css
/* Light Mode */
--background: 0 0% 100%;           /* #FFFFFF */
--foreground: 222 47% 11%;         /* #0F172A — slate-900 */
--primary: 221 83% 53%;            /* #3B82F6 — blue-500 */
--primary-foreground: 0 0% 100%;   /* #FFFFFF */
--secondary: 217 33% 17%;         /* #1E293B — slate-800 */
--accent: 210 40% 96%;             /* #F1F5F9 — slate-100 */
--muted: 210 40% 96%;              /* #F1F5F9 */
--card: 0 0% 100%;                 /* #FFFFFF */
--sidebar: 222 47% 6%;             /* #070B14 — very dark */

/* Dark Mode */
--background: 222 47% 6%;          /* #070B14 */
--foreground: 210 40% 98%;         /* #F8FAFC — slate-50 */
--primary: 217 91% 60%;            /* #60A5FA — blue-400 */
--primary-foreground: 222 47% 6%;  /* #070B14 */
--secondary: 217 33% 17%;          /* #1E293B */
--accent: 217 33% 12%;             /* #151D2E */
--muted: 217 33% 12%;              /* #151D2E */
--card: 222 47% 8%;                /* #0D1424 */
--sidebar: 222 47% 4%;             /* #050810 — darkest */
```

### Chart Data Colors

A 10-color palette optimized for distinguishability (colorblind-safe):

```typescript
const CHART_COLORS = {
  light: [
    '#3B82F6',  // Blue
    '#10B981',  // Emerald
    '#F59E0B',  // Amber
    '#EF4444',  // Red
    '#8B5CF6',  // Violet
    '#06B6D4',  // Cyan
    '#F97316',  // Orange
    '#EC4899',  // Pink
    '#14B8A6',  // Teal
    '#6366F1',  // Indigo
  ],
  dark: [
    '#60A5FA',  // Blue-400
    '#34D399',  // Emerald-400
    '#FBBF24',  // Amber-400
    '#F87171',  // Red-400
    '#A78BFA',  // Violet-400
    '#22D3EE',  // Cyan-400
    '#FB923C',  // Orange-400
    '#F472B6',  // Pink-400
    '#2DD4BF',  // Teal-400
    '#818CF8',  // Indigo-400
  ],
};
```

### Semantic Colors

```css
--success: 142 76% 36%;            /* #16A34A — green-600 */
--warning: 38 92% 50%;             /* #F59E0B — amber-500 */
--error: 0 84% 60%;                /* #EF4444 — red-500 */
--info: 199 89% 48%;               /* #0EA5E9 — sky-500 */

/* Connection states */
--connected: var(--success);
--disconnected: 217 33% 50%;       /* gray */
--connecting: var(--warning);
```

---

## Implementation

### 1. Update CSS Variables

Modify `app/src/app/globals.css` (or wherever the Tailwind CSS variables are defined):

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --primary: 221 83% 53%;
    /* ... full palette above */
  }

  .dark {
    --background: 222 47% 6%;
    --foreground: 210 40% 98%;
    --primary: 217 91% 60%;
    /* ... full palette above */
  }
}
```

### 2. Chart Color Provider

Create a chart theme context that provides the color palette to all chart components:

```typescript
// component/src/charts/chart-theme.ts
export const chartTheme = {
  light: {
    colors: CHART_COLORS.light,
    backgroundColor: 'transparent',
    textColor: '#0F172A',
    axisLineColor: '#E2E8F0',
    splitLineColor: '#F1F5F9',
  },
  dark: {
    colors: CHART_COLORS.dark,
    backgroundColor: 'transparent',
    textColor: '#F8FAFC',
    axisLineColor: '#1E293B',
    splitLineColor: '#151D2E',
  },
};
```

### 3. ECharts Theme Registration

```typescript
// In BaseChart or a theme provider:
import * as echarts from 'echarts';

echarts.registerTheme('neoboard-light', {
  color: CHART_COLORS.light,
  backgroundColor: 'transparent',
  // ... axis, tooltip, legend styles
});

echarts.registerTheme('neoboard-dark', {
  color: CHART_COLORS.dark,
  backgroundColor: 'transparent',
  // ... axis, tooltip, legend styles
});
```

### 4. Sidebar Styling

The sidebar should use the darkest color variant for visual hierarchy:
- Dark mode: nearly black background with subtle borders
- Light mode: white/light gray with a subtle left border accent

### 5. Storybook Theme

Update `.storybook/preview.ts` to show components with the NeoBoard theme:
- Add a theme toggle (light/dark) to the Storybook toolbar
- Use the NeoBoard CSS variables in the Storybook canvas

---

## Design Tokens Reference

### Typography
- **Headings**: Inter/system font, semi-bold
- **Body**: Inter/system font, regular
- **Code/Queries**: JetBrains Mono or system monospace
- **Dashboard title**: 18px semi-bold
- **Widget title**: 14px medium
- **Data labels**: 12px regular

### Spacing
- **Page padding**: 24px (p-6)
- **Card padding**: 16px (p-4)
- **Grid gap**: 16px (gap-4)
- **Widget minimum height**: 200px

### Borders & Shadows
- **Card border**: 1px solid `--border` (subtle in dark mode)
- **Card shadow**: minimal — `shadow-sm` in light mode, none in dark mode
- **Sidebar border**: 1px right border with `--border`
- **Focus ring**: 2px `--primary` ring

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `app/src/app/globals.css` | Modify | Update CSS variables with new palette |
| `component/src/charts/chart-theme.ts` | Create | Chart color palette and ECharts theme |
| `component/src/charts/base-chart.tsx` | Modify | Use registered ECharts theme |
| `component/.storybook/preview.ts` | Modify | Apply NeoBoard theme to Storybook |
| `app/tailwind.config.ts` | Modify | Extend colors if needed |

---

## Acceptance Criteria

- [ ] Application has a distinctive, professional color palette
- [ ] Light and dark modes both look polished
- [ ] Chart colors are distinguishable and colorblind-friendly
- [ ] Sidebar has clear visual hierarchy (darkest element)
- [ ] Connection status indicators use semantic colors
- [ ] ECharts uses the NeoBoard color palette
- [ ] Storybook reflects the NeoBoard theme
