---
name: github-workflow
description: GitHub conventions, labels, branching for NeoBoard.
model: haiku
---

# Branches

- Prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `security/`
- Default base: `dev`. **Exception**: when a `release/X.Y` branch is active, branch from + PR to it instead.

# Commits

`type(scope): description`

- Types: feat, fix, chore, docs, refactor, security, perf, test
- Scopes: app, component, connection, cli, auth, encryption, migration, api, widget, chart

# Labels (apply type + package + area)

- **Type**: bug, enhancement, security, documentation, performance, urgent, breaking-change, refactor, tech-debt, chore, question
- **Package**: pkg:app, pkg:component, pkg:connection, pkg:cli
- **Area**: area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api, area:a11y, area:params, area:table, area:design, area:devex, area:typography, area:motion, area:ci, area:release
- **Special**: enterprise, release-blocker, blocked, backlog, good first issue, claude, dependencies
