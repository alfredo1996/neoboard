---
name: ui-audit
description: Run a systematic quality audit across accessibility, performance, responsive design, theming, and anti-patterns. Generates a severity-rated findings report with actionable recommendations.
user-invokable: true
args:
  - name: area
    description: The page, component, or feature to audit (optional — audits whole app if omitted)
    required: false
---

Run systematic quality checks and generate a structured audit report with prioritized issues. This is an audit, not a fix — document issues for other commands to address.

**Before starting**: Read the design-review skill (`/.claude/skills/design-review/skill.md`) for NeoBoard's design tokens, spacing rules, typography scale, and chart patterns. That document IS the design system.

## Diagnostic Scan

Check each dimension against real code (read files, don't guess):

### 1. Accessibility (A11y)
- **Contrast**: Text contrast ratios < 4.5:1 (body) or < 3:1 (large text)
- **Missing ARIA**: Interactive elements without proper roles, labels, or states
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps
- **Semantic HTML**: Improper heading hierarchy, missing landmarks, `div` used as `button`
- **Form issues**: Inputs without labels, poor error messaging, missing required indicators
- **Chart accessibility**: ECharts `aria` option not set, no alt text for chart data

### 2. NeoBoard Design System Compliance
- **Token violations**: Hard-coded hex/hsl values instead of CSS variable tokens
- **Spacing violations**: Using `p-3`, `p-5`, `p-8`, `gap-1` — breaking the 4/6 rhythm
- **Typography violations**: Using `text-2xl`+, `font-bold` for headings, wrong description pattern
- **Radius violations**: Wrong radius for component type (should be xl=cards, md=buttons, full=circles)
- **Chart violations**: Inline colors, `import * from 'echarts'`, title inside chart, custom theme
- **Button misuse**: Wrong variant for context (primary for cancel, ghost for primary action)
- **Missing patterns**: Not using `EmptyState` component, not using `LoadingButton`/`LoadingOverlay`

### 3. Responsive Design
- **Fixed widths**: Hard-coded widths that break on mobile
- **Touch targets**: Interactive elements < 44x44px
- **Horizontal scroll**: Content overflow on narrow viewports
- **Widget grid**: react-grid-layout breakpoints not respected
- **Text scaling**: Layouts that break when text size increases 200%

### 4. Performance
- **Layout thrashing**: Reading/writing layout properties in loops
- **Expensive animations**: Animating width/height/top/left instead of transform/opacity
- **Missing dynamic import**: Chart components not using `next/dynamic` with `ssr: false`
- **Heavy imports**: NVL, Leaflet, or ECharts loaded when not needed
- **Unnecessary re-renders**: Missing memoization, inline object/function props

### 5. Anti-Patterns (CRITICAL)
- **Nested cards**: Cards inside cards — flatten the hierarchy
- **Gray on color**: Gray text on colored backgrounds — use a shade of that color instead
- **Pure black/white**: Using `#000` or `#fff` instead of tinted neutrals from tokens
- **Gradient text**: Decorative gradient on metrics or headings
- **Everything centered**: Left-aligned text with asymmetric layouts feels more designed
- **Same spacing everywhere**: No visual rhythm — tight groupings + generous separations
- **Modal overuse**: Modals when inline expansion, sidebar, or page navigation would work
- **Redundant copy**: Headers that restate the page title, descriptions that repeat the heading

## Generate Audit Report

Structure output as:

### Executive Summary
- Total issues (count by severity)
- Top 3-5 most critical issues
- Recommended next steps

### Detailed Findings

For each issue:
- **Location**: Component, file path, line number
- **Severity**: Critical / High / Medium / Low
- **Category**: A11y / Design System / Responsive / Performance / Anti-Pattern
- **Description**: What the issue is
- **Impact**: How it affects users
- **Recommendation**: Specific fix

Group by severity (Critical first).

### Systemic Issues

Recurring problems across multiple files:
- "Hard-coded colors in 12 components — should use CSS variable tokens"
- "Missing empty states in 5 widget types"

### Positive Findings
Note 2-3 things done well to maintain.

### Fix Recommendations

Map issues to available skills:
- `/polish` — spacing, states, transitions, copy consistency
- `/harden` — error handling, edge cases, loading/empty states
- `/design-review` — visual consistency against design system
- `/code` — implementation fixes

**NEVER**:
- Report issues without explaining impact
- Skip positive findings
- Fix issues during audit (document only)
- Report false positives without reading the actual code
- Ignore the NeoBoard-specific patterns in design-review
