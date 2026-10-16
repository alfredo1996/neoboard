---
name: design-review
description: NeoBoard's design system (#2210) — widgets as flat panels 12px apart on a tinted ground (#2219), one surface with hairline rules elsewhere, the type scale, radii, colour tokens, chart rules and the anti-patterns to flag. Use when writing or reviewing UI code; the full tables, grids and critique format live in reference.md.
user-invocable: false
paths:
  - "**/*.tsx"
  - "**/*.css"
---

# Design review — the core rules

The redesign system (epic #2210, tokens from #2215). Components are migrated to it issue by issue, so code you read may still carry the old look: judge a change against this file, not against the neighbouring code. `reference.md` in this directory has the token tables, chart palettes, dialog and grid sizes, and a general critique format. `design-reviewer` reports in its own format.

## Panels on a ground, one surface elsewhere

- A widget is a flat `Panel`: 1px `--rule` border, 8px radius (`rounded-md`), `--card` fill, no shadow. Panels sit 12px apart, the same in view and edit mode, so entering edit moves nothing (#2219). The owner rejected a ruled sheet with shared 1px gutters: it read as one giant table.
- The dashboard area behind the panels is `--ground`: a faint grey in light, darker than the panels in dark. A hovered or focused panel tints to `--panel-hover`, which stays visibly off the ground; both are pinned in `graphite-citrine-tokens.test.ts`. Widget actions appear on hover or focus, by opacity only; on touch only the "⋯" menu shows.
- Everywhere else the page is one surface: `--card` and `--surface` are the page colour, and areas are separated by whitespace and a hairline rule (`border-border`, `--rule`), not by a card per section. A bordered panel is for a widget, a thing the user moves and resizes.
- `--side` is the sidebar and rail; `--field` is the fill of inputs and overlays.
- Shadows only on overlays (popover, dropdown, dialog, toast). Never on a panel, button or input.

## Colour

- Semantic tokens only (`--background`, `--foreground`, `--foreground-2`, `--muted-foreground`, `--rule`, `--side`, `--field`, `--ring`…). Never raw hex or hsl in a component.
- Ink has three steps: `text-foreground`, `text-foreground-2`, `text-muted-foreground`. All three hold 4.5:1 on the page and on `--side` (pinned by `graphite-citrine-tokens.test.ts`).
- A field border uses `--input`, not `--border`: it must reach 3:1 on the page (WCAG 1.4.11). `--rule` and `--rule-strong` are decoration and are not enough for a control edge.
- Interaction is azure (`--ring`, #1553). Citrine (`--brand`) is the wordmark and the lead chart series only.

## Typography

- Faces: Source Serif 4 (`font-serif`) for page titles and the wordmark only; IBM Plex Sans (`font-body`, `font-display`) for everything else; IBM Plex Mono (`font-mono`) for code and query text only. Tabular figures are on at the root.
- Scale (Tailwind utilities): `text-title` 36/600 (with `font-serif`), `text-stat` 36/600, `text-section` 15/600, `text-body` 14, `text-widget-title` 13/600, `text-meta` 12. No other sizes. `text-h1` to `text-h3` survive only until the card stat and markdown headings migrate.
- `font-medium` for interactive elements, `font-semibold` for titles, `font-bold` never.
- No subtitle that restates the title: a description earns its line by saying something the title does not.

## Radius, borders

- Controls 6px (`rounded-sm`), panels 8px (`rounded-md`), overlays 10px (`rounded-overlay`), checkbox 4px (`rounded-checkbox`). `rounded-full` for pills and dots only. `--radius-lg` (12) is the old card radius: widget panels left it in #2219, and it goes when its last user migrates.
- 1px `border-border` by default; `border-input` on fields; `border-2 border-primary` for a selected item; never `border-4`.
- Radius and type-scale values are pinned in `component/src/lib/__tests__/graphite-citrine-tokens.test.ts`.

## Charts

- Colours come from `resolveChartColors()`, never inline; the only themes are `neoboard-light` and `neoboard-dark`.
- No title inside the chart — the widget header is the title. The legend sits at the bottom.
- Never set `splitLine.lineStyle` in a chart module, and never hide category labels at a breakpoint; truncate them instead (#1247).

## Components

- Empty states use `EmptyState`; loading uses `LoadingButton` or `LoadingOverlay`.
- Buttons: `default` for the primary action, `outline` to cancel, `destructive` to delete, `ghost` in toolbars.

## Red flags to call out

- Nested cards, everything in cards, identical card grids, everything centred.
- A shadow on anything that is not an overlay; a card wrapping a section; widget panels with no gap between them (the rejected ruled sheet).
- Serif anywhere except a page title or the wordmark; Inter or Geist; monospace as "technical" styling.
- A subtitle that restates the title; headers that restate the page.
- Grey text on coloured fills, pure `#000` or `#fff`, neon accents on dark, gradient text on metrics.
- A field edge lighter than 3:1; a big icon above every heading.
- Bounce easing, animating width, height or padding, glassmorphism as decoration.
- Every button primary, "Error occurred".

## Checklist before a UI PR

- [ ] Widgets are flat panels 12px apart on `--ground`; elsewhere one surface with hairline rules; no card wrapping a section; shadows only on overlays
- [ ] Type from the scale; serif only for the page title and wordmark
- [ ] Tokens, never raw colours; charts through `resolveChartColors()`
- [ ] Radius matches the component: controls 6, panels 8, overlays 10, checkbox 4
- [ ] Field borders use `--input` (3:1)
- [ ] `EmptyState`, `LoadingButton` and `LoadingOverlay` where they apply
- [ ] Checked in both light and dark
