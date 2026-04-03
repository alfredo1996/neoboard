# NeoBoard UX Friction Report

Generated via automated user simulation agents against the live app (release/1.0).

---

## Part 1: Admin Power User (Alex)

**Overall: 3.5/5 stars | 55 screenshots | 0 console errors**

### Session Summary

- 6 tasks completed (1 partial — API key creation failed)
- ~65 clicks across full session
- Dashboard creation: 22 clicks for 3 widgets + extra page + save

### Top Friction Points

| #   | Severity   | Issue                                                                                                                |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **High**   | Connection Edit does not pre-fill values — opens blank fields, user must re-enter URI/username/password from scratch |
| 2   | **High**   | API Key creation fails with vague "Failed to create API key" error — no context on why                               |
| 3   | **Medium** | Bar chart renders blank/gray on initial widget placement — only appears after resize/reload                          |
| 4   | **Medium** | Axis controls (X/Y/Group By) shown on widget cards in edit mode — clutters the view                                  |
| 5   | **Medium** | Bar chart X-axis labels overlap/truncate at default 6-column width                                                   |
| 6   | **Low**    | Pie chart legends paginated (1/3) with tiny arrows — hard to see all categories                                      |
| 7   | **Low**    | Dashboard thumbnails don't adapt to dark mode — light previews on dark background                                    |

### What Works Well

- Login is fast (388ms)
- Connection test with inline error feedback + expandable error cards — standout feature
- User management: inline role dropdowns, write toggles, force password change with temp password dialog
- Profile settings page well-structured
- Widget Showcase: 28 widgets across 5 pages — impressive
- Dark mode comprehensive, zero contrast issues detected
- Fullscreen chart view works perfectly
- Zero console errors throughout session
- Multi-page dashboards with tab navigation

### Recommendations

| Priority | Area             | Suggestion                                                         |
| -------- | ---------------- | ------------------------------------------------------------------ |
| P0       | Connections      | Fix edit dialog to pre-fill existing connection values             |
| P0       | API Keys         | Debug creation failure; improve error message specificity          |
| P1       | Dashboard Editor | Auto-run query preview when connection + chart type selected       |
| P1       | Dashboard Editor | Hide axis/group-by dropdowns from widget cards; keep in modal only |
| P1       | Charts           | Fix bar chart blank render on initial placement                    |
| P2       | Charts           | Responsive bar chart label rotation based on width                 |
| P2       | Charts           | Scrollable/wrapped pie chart legend instead of paginated           |
| P2       | Dashboard List   | Apply dark-mode filter to thumbnail previews                       |
| P2       | Users            | Show current user identity in sidebar                              |
| P3       | Widget Editor    | Add quick templates ("Top N by count", "Time series")              |
| P3       | Onboarding       | Guided walkthrough for first-time empty dashboard                  |

---

## Part 2: First-Time Creator (Jordan)

**Overall: 3/5 stars | Onboarding: 2/5 | 58 steps | 6/7 tasks completed**

### Top Friction Points

| #   | Severity | Issue                                                                               |
| --- | -------- | ----------------------------------------------------------------------------------- |
| 1   | **P0**   | Login page has no product description — new users don't know what NeoBoard is       |
| 2   | **P0**   | "Sign up" link loops when registration is disabled — looks broken                   |
| 3   | **P0**   | Cypher query persists when switching to PostgreSQL connection — wrong language risk |
| 4   | **P1**   | No onboarding tour, tooltip walkthroughs, or getting started guide                  |
| 5   | **P1**   | `/settings` root shows broken skeleton — should redirect to `/settings/profile`     |
| 6   | **P1**   | Widget editing requires 3 clicks (kebab → Edit) — no double-click shortcut          |
| 7   | **P2**   | Dashboard cards only clickable on title text, not entire card                       |
| 8   | **P2**   | Widget Lab empty with no starter templates                                          |
| 9   | **P2**   | Widget Lab card icons have no labels                                                |
| 10  | **P3**   | Style tab doesn't refresh when chart type changes                                   |
| 11  | **P3**   | Transform tab has no help text                                                      |

### What Works Well

- Clean modern UI with consistent styling
- 16 chart types — strong offering comparable to Grafana/Metabase
- Live preview pane in widget editor — "exactly like Tableau's Data Source preview"
- SQL auto-detected from connection type
- Rich table features (sort, paginate, group, color scales, conditional formatting)
- Widget actions (Export CSV, Duplicate, Save to Widget Lab)
- Theme toggle, auto-refresh, import/export
- "Add Widget" dialog comprehensive and well-organized

### Recommendations

| Priority | Suggestion                                                                         | Why                                           |
| -------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| P0       | Add tagline on login page ("Visual dashboards for Neo4j & PostgreSQL")             | New users have zero context about the product |
| P0       | Fix "Sign up" redirect loop — hide link or show message when registration disabled | Makes app look broken                         |
| P0       | Clear query editor when switching connection types                                 | Wrong-language query risk                     |
| P1       | Add "Getting Started" empty state for new users with no dashboards                 | Guide first-time users                        |
| P1       | Fix /settings root redirect to /settings/profile                                   | Shows broken skeleton                         |
| P1       | Allow double-click widget to edit                                                  | Reduce friction from 3 clicks to 1            |
| P2       | Make entire dashboard card clickable                                               | Standard UX pattern                           |
| P2       | Add starter templates to Widget Lab                                                | Empty lab doesn't convey value                |
| P2       | Add tooltips to Widget Lab card icons                                              | 5 unlabeled icons require guessing            |
| P3       | Refresh Style tab when chart type changes                                          | Stale options from previous type              |
| P3       | Add help text to Transform tab                                                     | New users are lost                            |

---

## Combined Priority Matrix

### P0 — Must Fix

1. Login page: add product tagline/description
2. Sign-up link: fix redirect loop when registration disabled
3. Query editor: clear query when switching connection types
4. Connection edit: pre-fill existing values (currently blank)
5. API key creation: debug failure + improve error message

### P1 — Should Fix

6. /settings root redirect to /settings/profile
7. Double-click widget to edit (reduce 3 clicks to 1)
8. Auto-run query preview in widget editor
9. Hide axis controls from widget cards in edit mode
10. Fix bar chart blank render on initial placement
11. Onboarding tour/getting started guide

### P2 — Nice to Have

12. Entire dashboard card clickable
13. Starter templates in Widget Lab
14. Tooltips on Widget Lab card icons
15. Responsive bar chart label rotation
16. Scrollable pie chart legend
17. Dark-mode-aware dashboard thumbnails
18. Current user identity in sidebar

### P3 — Polish

19. Refresh Style tab on chart type change
20. Help text on Transform tab
21. Quick templates in widget editor
