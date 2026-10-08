---
name: github-workflow
description: GitHub conventions for NeoBoard (labels, branches, commit and title scopes, base branch, gh quirks).
model: haiku
---

# Branches

- **Prefixes:** `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`, `security/`, as `<prefix>issue-<N>-<slug>`.
- **Base:** the active `release/X.Y` when one exists (branch from it, and PR into it), otherwise `dev`. Never `main`: `dev` → `main` is the owner's.
- **Worktrees:** work in `.claude/worktrees/<name>`. The main checkout stays on the active release branch, because hooks and CLAUDE.md run from it.

# Commits and titles

`type(scope): what now happens (#<issue>)`

- **Types:** feat, fix, chore, docs, refactor, security, perf, test.
- **Common scopes:** app, component, connection, connector-sdk, cli, api, auth, dashboard, widgets, charts, editor, params, table, transforms, query, connections, a11y, layout, migrations, docker, deps, docs, e2e, scripts, claude, security.

# Labels (apply type + package + area, and a priority on bugs)

- **Type:** bug, enhancement, security, documentation, performance, refactor, tech-debt, chore, breaking-change, dependencies, testing, question
- **Package:** pkg:app, pkg:component, pkg:connection, pkg:cli
- **Area:** area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api, area:a11y, area:params, area:table, area:design, area:devex, area:typography, area:motion, area:ci, area:release, area:launch
- **Priority:**
  - priority:P1 blocks users or the release;
  - priority:P2 is the default for a real bug;
  - priority:P3 is minor.
- **Special:** enterprise, release-blocker, blocked, backlog, urgent, good first issue, claude
- **Legacy, don't apply:** `type: fix`, `type: docs`, `type: chore`, `type:bug`, `area: charts`, `area: a11y`, `package: component`, `area:parameters`.

# gh on this repo

- **Account:** use `alfredo1996` for push, label and merge. Check with `gh auth status`.
- **Labels and milestone:** they work on `gh pr create`. `gh pr edit` and `gh issue edit` fail with a Projects (classic) GraphQL error and set nothing. Use REST: `gh api -X PATCH repos/alfredo1996/neoboard/issues/<N> -F milestone=<n>`, and `gh api -X POST repos/alfredo1996/neoboard/issues/<N>/labels -f 'labels[]=…'`.
- **Reads:** use `gh issue view <N> --json …` (or `--comments`). A plain `gh issue view` can trip the same GraphQL error.
