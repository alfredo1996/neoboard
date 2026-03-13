---
name: polish
description: Final quality pass before shipping. Fixes alignment, spacing, interaction states, transitions, copy consistency, and detail issues across NeoBoard UI.
user-invokable: true
args:
  - name: target
    description: The page, component, or feature to polish (optional)
    required: false
---

Meticulous final pass to catch all the small details that separate good from great. Polish is the last step, not the first — don't polish work that's not functionally complete.

**Before starting**: Read the design-review skill (`/.claude/skills/design-review/skill.md`) for NeoBoard's design tokens, spacing, typography, and component patterns.

## Pre-Polish Assessment

1. **Review completeness**: Is it functionally done? Are tests passing?
2. **Take before screenshots**: Use the screenshot-review workflow (`.screenshots/before/`)
3. **Identify polish areas**: Visual inconsistencies, missing states, copy issues

## Polish Checklist — NeoBoard Specific

Work through each dimension, reading actual code:

### Spacing & Alignment
- [ ] Page root uses `p-6`
- [ ] Cards use `p-6` padding (or `p-4` for compact widget/connection cards)
- [ ] Section gaps use `space-y-4`, form fields use `space-y-2`
- [ ] Inline elements use `gap-2` (buttons, badges, icons)
- [ ] No rogue spacing (`p-3`, `p-5`, `p-8`, `gap-1`, `gap-3`)
- [ ] Grid uses `gap-4` consistently
- [ ] Elements align to grid at all breakpoints

### Typography
- [ ] Page titles: `text-lg font-semibold`
- [ ] Body/interactive text: `text-sm font-medium`
- [ ] Descriptions: `text-sm text-muted-foreground`
- [ ] Metadata/labels: `text-xs font-medium`
- [ ] Card titles match `font-semibold leading-none tracking-tight`
- [ ] No `text-2xl`, `text-3xl`, or `font-bold` on headings

### Color & Tokens
- [ ] All colors use CSS variable tokens, no raw hex/hsl
- [ ] Opacity modifiers used correctly (`/80`, `/60`, `/50` for overlays/hover)
- [ ] Role badges: admin=destructive, creator=default, reader=secondary
- [ ] Secondary text consistently uses `text-muted-foreground`
- [ ] Chart colors from `resolveChartColors()`, never inline

### Interaction States
Every interactive element needs:
- [ ] **Hover**: Subtle feedback (color shift, opacity)
- [ ] **Focus**: Visible keyboard focus indicator (ring)
- [ ] **Active**: Click/tap feedback
- [ ] **Disabled**: Clearly non-interactive, reduced opacity
- [ ] **Loading**: `LoadingButton` with spinner for async actions
- [ ] **Error**: Validation or error state with `text-destructive`

### Widget-Specific Polish
- [ ] Widget cards use compact padding (`p-4 pb-2` header, `p-4 pt-2` content)
- [ ] Chart tooltips display correctly, don't overflow widget bounds
- [ ] Widget header actions use `variant="ghost" size="icon" className="h-8 w-8"`
- [ ] Empty widgets use `EmptyState` component with helpful message
- [ ] Loading widgets use chart's internal loading or `LoadingOverlay`
- [ ] Error widgets show clear error with retry option
- [ ] Parameter bar spacing is consistent

### Modals & Dialogs
- [ ] Correct size progression (sm/md/lg/xl per design-review)
- [ ] Widget editor transitions: `sm:max-w-md` (step 1) → `sm:max-w-6xl` (step 2)
- [ ] Cancel button uses `variant="outline"`, save uses `variant="default"`
- [ ] Delete/destructive actions use `variant="destructive"`
- [ ] Focus trapped within dialog, ESC closes

### Sidebar & Navigation
- [ ] Active item uses `bg-accent text-accent-foreground`
- [ ] Tab active uses `border-b-2 border-primary text-foreground`
- [ ] Consistent hover states across nav items

### Forms
- [ ] All inputs have visible labels
- [ ] Required fields indicated
- [ ] Error messages specific and helpful (not "Error occurred")
- [ ] Tab order logical
- [ ] Validation timing consistent (on blur or on submit, not mixed)

### Content & Copy
- [ ] Consistent terminology (same things called same names)
- [ ] Consistent capitalization (Title Case vs Sentence case)
- [ ] No typos
- [ ] Button labels are verbs ("Save", "Create", "Delete") not nouns
- [ ] Empty state copy guides user to action

### Edge Cases
- [ ] Loading states for all async operations
- [ ] Empty states use `EmptyState` component (not blank space)
- [ ] Error states with recovery path (retry button)
- [ ] Long text truncated or wrapped appropriately
- [ ] No console errors or warnings

### Code Quality
- [ ] No `console.log` in production code
- [ ] No commented-out code
- [ ] No unused imports
- [ ] No TypeScript `any` without justification comment
- [ ] No inline styles that should use Tailwind classes

## Post-Polish

1. **Take after screenshots**: `.screenshots/after/`
2. **Run lint**: `cd app && npx next lint --fix`
3. **Run build**: `npm run build`
4. **Run tests**: Relevant test suite for the changed package
5. **Self-review**: Actually use the feature end-to-end

**NEVER**:
- Polish before it's functionally complete
- Introduce bugs while polishing (test after every change)
- Add features during polish — polish is refinement only
- Ignore systematic issues (if spacing is off everywhere, fix the system)
- Skip the screenshot workflow
