---
name: design-review
description: NeoBoard's design system (#2210) — a calm page with BI cards for widgets (white card, edge, light shadow, header rule), the page kit (header, filter line, list row, settings section, stat, sidebar and rail), the type scale, radii, colour tokens, chart rules and the anti-patterns to flag. Use when writing or reviewing UI code; the full tables, grids and critique format live in reference.md.
user-invocable: false
paths:
  - "**/*.tsx"
  - "**/*.css"
---

# Design review — the core rules

The redesign system (epic #2210, tokens from #2215). Code you read may still carry the old look: judge a change against this file, not the neighbouring code. `reference.md` in this directory has the token tables, chart palettes, dialog and grid sizes, and a general critique format. `design-reviewer` reports in its own format.

## The page, and the widget card

- The page and its sections are one surface, set off by whitespace and hairline rules (`border-border`, `--rule`). No `p-6` card around every block. `--surface` is the page colour; `--side` is the sidebar; `--field` fills inputs and overlays.
- A widget is a BI card (#2247), the one thing that floats: a white `--card` (`#FFFFFF` light, `#181B20` dark), a 1 px `--card-edge` (`#DDE1E6` / `#2C3038`), an 8 px radius and the two-layer `--card-shadow` (`shadow-card`), on `--page-ground` (`#EEF0F3` / `#0D0F12`). Cards sit 12 px apart. `Panel` is that card; use it, never rebuild it.
- Inside the card: a header (12/16/10: sans title 14/600, a 12 px ink-3 source line, a 1 px `--rule` under it) and a body (12/16/16). Hover or focus darkens the edge to `--card-edge-hover`; the fill never tints. Actions show by opacity only (so Tab reaches them); on touch only the menu shows.
- Shadows elsewhere only on overlays (popover, dropdown, dialog, toast). Never on a button, input or section.

## The page kit (#2225)

`component/src/components/kit/`: `PageHeader`, `FilterLine`, `List`/`ListRow`, `SettingsSection`, `Stat`, `Sidebar` (rail under 1024 px, hand toggle on wide screens), `AppShell`, `Wordmark` (name from `PRODUCT_NAME`). Use them, never rebuild one; all sit on the card treatment and carry no serif. Page titles are sans 24/600. Details: `reference.md`.

## Colour

- Semantic tokens only (`--background`, `--foreground`, `--foreground-2`, `--muted-foreground`, `--rule`, `--side`, `--field`, `--ring`…). Never raw hex or hsl in a component.
- Ink has three steps: `text-foreground`, `text-foreground-2`, `text-muted-foreground`. All three hold 4.5:1 on the page and on `--side` (pinned by `graphite-citrine-tokens.test.ts`).
- A field border uses `--input`, not `--border`: it must reach 3:1 on the page (WCAG 1.4.11). `--rule` and `--rule-strong` are decoration and are not enough for a control edge.
- Interaction is azure (`--ring`). Citrine (`--brand`) is the wordmark and the lead chart series only.

## Typography

- Faces: IBM Plex Sans (`font-body`, `font-display`) for everything, titles and wordmark included; Source Serif 4 only as a widget card's optional `titleFont="serif"` and on pages not yet on the kit; IBM Plex Mono (`font-mono`) for code and query text only.
- Scale: page title 24/600 (`PageHeader`), `text-stat` 36/600, `text-section` 15/600, `text-body` 14, `text-widget-title` 14/600, `text-meta` 12, and the kit steps `text-caption` 13, `text-figure` 24/600, `text-wordmark` 18/600. No other sizes. `text-h1` to `text-h3` are legacy.
- `font-medium` for interactive elements, `font-semibold` for titles, `font-bold` never.

## Radius, borders

- Controls 6px (`rounded-sm`), widget card 8px (`rounded-md`), overlays 10px (`rounded-overlay`), checkbox 4px (`rounded-checkbox`). `rounded-full` for pills and dots only. `--radius-lg` (12) is the old card radius and is not used on widgets.
- 1px `border-border` by default; `border-input` on fields; `border-2 border-primary` for a selected item; never `border-4`.

## Charts

- Colours come from `resolveChartColors()`, never inline; the only themes are `neoboard-light` and `neoboard-dark`.
- No title inside the chart — the widget header is the title. The legend sits at the bottom.
- Never set `splitLine.lineStyle` in a chart module, and never hide category labels at a breakpoint; truncate them instead (#1247).

## Components

- `EmptyState`, `LoadingButton`, `LoadingOverlay`. Buttons: `primary`, `secondary`, `danger` (delete), `ghost`; `danger-confirm` only in dialogs.

## Red flags to call out

- Nested cards, everything in cards, identical card grids, everything centred.
- The three looks the owner rejected: a heavy shadowed floating card ("AI-made"), a ruled sheet with no card at all ("a giant table"), and a flat panel with a faint edge on a barely-grey page ("a post-it"). The card is white, edged, lightly shadowed, on a clearly grey page.
- A shadow on anything that is not a widget card or an overlay; a hover tint on the card fill; a card with no edge.
- Serif in the kit, a page title or the wordmark; Inter or Geist; monospace as "technical" styling.
- A subtitle that restates the title; headers that restate the page.
- Grey text on coloured fills, pure `#000` or `#fff`, neon accents on dark, gradient text on metrics.
- A field edge lighter than 3:1; a big icon above every heading.
- Bounce easing, animating width, height or padding, glassmorphism; every button primary.

## Checklist before a UI PR

- [ ] Sections set off by whitespace and rules, no `p-6` card wrapping a section; widgets are `Panel`/`WidgetCard` cards; shadows only on cards and overlays
- [ ] Type from the scale; no serif in the kit, the page title or the wordmark; chrome from the kit
- [ ] Tokens, never raw colours; charts through `resolveChartColors()`
- [ ] Radius matches the component: controls 6, widget card 8, overlays 10, checkbox 4
- [ ] Field edges `--input` (3:1); controls in `<Field>`
- [ ] `EmptyState`, `LoadingButton` and `LoadingOverlay` where they apply
- [ ] Checked in both light and dark
