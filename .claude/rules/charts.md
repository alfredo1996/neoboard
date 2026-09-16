---
paths:
  - "component/src/charts/**"
  - "app/src/components/**"
---

# Charts & widgets

- Chart components MUST use `next/dynamic` with `ssr: false`. No exceptions.
- ECharts: import from `echarts/core` + specific modules. NEVER `import * as echarts from 'echarts'`.
- Heavy deps (NVL, Leaflet) loaded only when a widget of that type is on the current dashboard.
- Check existing components in `component/src/` and Storybook before creating new ones.

The first two are enforced by PreToolUse hooks, so a violation is blocked rather than reviewed. Before changing how a chart looks, read `.claude/skills/design-review/SKILL.md` — it is the design system as built, not as wished for.
