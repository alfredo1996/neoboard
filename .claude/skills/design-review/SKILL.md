---
name: design-review
description: NeoBoard's design system as built — spacing rhythm, colour tokens, typography scale, radii, chart rules and the anti-patterns to flag. Use when writing or reviewing UI code; the full palettes, grids and critique format live in reference.md.
user-invocable: false
paths:
  - "**/*.tsx"
  - "**/*.css"
---

# Design review — the core rules

Extracted from the codebase, not aspirational. This is the short version: `reference.md` in this directory has the full token tables, chart palettes, dialog and grid sizes, and a general critique format for ad-hoc reviews. `design-reviewer` reports in its own format.

## Spacing

- Page root padding is `p-6`, always. Cards use `p-6`; `p-4` only for the compact `WidgetCard` and `ConnectionCard`.
- Sections `space-y-4` / `gap-4`; form fields `space-y-2`; inline groups `gap-2`.
- Never `p-3`, `p-5` or `p-8` and up; never `gap-1` for button groups; one `space-y` value per form.

## Colour

- Semantic tokens only (`--background`, `--foreground`, `--muted-foreground`, `--ring`…). Never raw hex or hsl in a component.
- The interaction accent is azure (`--ring`, #1553). Citrine (`--brand`) is the wordmark and the lead chart series only.
- Opacity modifiers `/80`, `/60`, `/50` are fine for overlays and hover states.
- Secondary text is `text-muted-foreground`.

## Typography

- The scale stops at `text-lg`: `text-xs` for labels, `text-sm` for body (dominant), `text-lg` for titles. No `text-2xl` or larger.
- `font-medium` for interactive elements, `font-semibold` for headings, `font-bold` only for metric values.
- Descriptions are `text-sm text-muted-foreground`.

## Radius, borders, shadows

- `rounded-md` (8px) for buttons and inputs, `rounded-lg` (12px) for cards and dialogs, `rounded-full` for pills. This is a decision, not a default — don't sharpen them.
- `border border-border` by default; `border-2 border-primary` for a selected item; never `border-4`.
- The authoritative radius values are pinned in `component/src/lib/__tests__/graphite-citrine-tokens.test.ts`.

## Charts

- Colours come from `resolveChartColors()`, never inline; the only themes are `neoboard-light` and `neoboard-dark`.
- No title inside the chart — the widget card header is the title. The legend sits at the bottom.
- Never set `splitLine.lineStyle` in a chart module, and never hide category labels at a breakpoint; truncate them instead (#1247).

## Components

- Empty states use `EmptyState`; loading uses `LoadingButton` or `LoadingOverlay`.
- Buttons: `default` for the primary action, `outline` to cancel, `destructive` to delete, `ghost` in toolbars.

## Red flags to call out

- Nested cards, everything in cards, identical card grids, everything centred.
- Grey text on coloured fills, pure `#000` or `#fff`, neon accents on dark, gradient text on metrics.
- Monospace as "technical" styling; a big icon above every heading.
- Bounce easing, animating width, height or padding, glassmorphism as decoration.
- Headers that restate the page, every button primary, "Error occurred".

## Checklist before a UI PR

- [ ] Page root `p-6`; cards `p-6`, or `p-4` for the compact cards
- [ ] `text-lg` titles, `text-sm` body, `text-xs` metadata
- [ ] Tokens, never raw colours; charts through `resolveChartColors()`
- [ ] Radius matches the component: lg cards, md controls, full pills
- [ ] `EmptyState`, `LoadingButton` and `LoadingOverlay` where they apply
- [ ] Checked in both light and dark
