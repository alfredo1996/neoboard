---
name: components
description: Build UI using NeoBoard's existing component library. Use when creating pages, widgets, dashboards, or any user-facing UI. Reads Storybook stories to understand available components before writing new code.
model: sonnet
allowed-tools: Read, Write, Edit, MultiEdit, Bash(npm *), Bash(npx *), Bash(find *), Bash(cat *), Bash(grep *), Bash(ls *)
---
# NeoBoard Component Library

Before building any UI, understand what already exists. Do NOT create new components when an existing one works.

## Step 1 — Discover existing components

Read the component library to understand what's available:

```bash
# Find all component source files
find component/src -name '*.tsx' -not -name '*.test.*' -not -name '*.stories.*' | head -40

# Find all Storybook stories (these show usage patterns)
find component/src -name '*.stories.tsx' | head -40

# Read a story to understand a component's API and variants
cat component/src/charts/BarChart.stories.tsx
```

## Step 2 — Check before creating

Before writing a new component, search for existing ones:

```bash
# Search by name
grep -rl 'export.*Button\|export.*Card\|export.*Modal' component/src/
# Search by functionality
grep -rl 'dropdown\|select\|tooltip\|dialog' component/src/
```

## Step 3 — Compose from existing

NeoBoard UI is built by composing from these layers:
1. **shadcn/ui** — Base primitives (Button, Dialog, Input, Select, etc.)
2. **component/** — NeoBoard components built on shadcn (charts, widgets, parameter selectors)
3. **app/** — Pages and layouts that compose NeoBoard components

Always prefer: shadcn primitive → existing NeoBoard component → new component (last resort).

## Step 4 — If creating a new component

Put it in `component/src/` following these rules:
- Props-driven, no internal API calls or store access
- Use shadcn/ui primitives as building blocks
- Tailwind for styling
- Add a Storybook story showing all variants
- Add unit tests
- Export from the package index

## Step 5 — Storybook

After modifying or adding components:
```bash
# Run Storybook to visually verify
npm run storybook
```

$ARGUMENTS = what to build or which component to modify.
