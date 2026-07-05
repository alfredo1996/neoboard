# NeoBoard Component Library

`@neoboard/components` — the React UI library for NeoBoard, built on shadcn/ui,
Radix, Tailwind CSS, and ECharts. **No business logic, no API calls, no stores,
no imports from `app/`** (enforced by hooks).

## Project Structure

```
component/
├── src/
│   ├── components/
│   │   ├── ui/              # Tier 1 — primitives (see tier rule below)
│   │   └── composed/        # Tier 2 — orchestrations of 2+ primitives
│   ├── charts/              # ECharts / NVL / Leaflet visualizations
│   ├── hooks/               # UI-only hooks (useContainerSize, …)
│   └── lib/                 # cn(), design tokens, pure UI utilities
├── stories/                 # Storybook — one story file per public component
├── design-tokens.css        # Graphite & Citrine theme tokens (light + dark)
└── tailwind-preset.cjs      # Shared Tailwind theme (keyframes, durations)
```

## The `ui` / `composed` tier rule

> **`ui/` holds a single Radix primitive or leaf element. `composed/`
> orchestrates two or more primitives (or adds stateful behavior).**

Practical test: if the file imports another component from `ui/` to build its
UI, it belongs in `composed/`.

Documented exceptions — these look primitive from the outside but are
correctly placed in `composed/` under the rule:

| Component         | Why it's composed                                       |
| ----------------- | ------------------------------------------------------- |
| `Combobox`        | Orchestrates `Popover` + `Command` (+ `Button` trigger) |
| `MultiSelect`     | Same `Popover` + `Command` pair with multi-value state  |
| `DateRangePicker` | Orchestrates `Popover` + `Calendar` with range state    |

And the inverse: `ui/toggle-group.tsx` stays in `ui/` even though it renders
`Toggle` styles — it wraps a single Radix primitive (`ToggleGroupPrimitive`)
and shares variants via context, not by composing other components.

## Conventions

Every public component ships with:

1. the component (`src/components/{ui,composed}/<name>.tsx`) with a JSDoc
   block — one-line purpose + when to use / when not to (rendered by
   Storybook autodocs and IDE hovers),
2. a Storybook story (`stories/{ui,composed}/<name>.stories.tsx`) covering
   each declared variant,
3. a jsdom test (`src/components/*/__tests__/<name>.test.tsx`),
4. an export from the package root (`@neoboard/components`).

Internal satellites (e.g. the `data-grid-*` subcomponents, `sidebar-item`,
`field-error`, the `Toaster` mount point) are demonstrated inside their
parent's story rather than getting standalone stories.

## Development

```bash
npm install          # from component/
npm run storybook    # component gallery (port 6006)
npm run test         # Vitest + React Testing Library
npm run build        # Vite ESM/UMD bundles
```

## Styling

- Tokens in `design-tokens.css` — Graphite surfaces + the Citrine amber
  accent (`--ring` / `--accent`), light and dark.
- `class-variance-authority` for variants; `tailwind-merge` via `cn()`.
- Charts consume the Citrine palettes from `src/charts/theme.ts` — never
  hardcode chart colors.
