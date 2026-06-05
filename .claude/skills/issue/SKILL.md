---
name: issue
description: Create a GitHub issue with proper labels.
disable-model-invocation: true
allowed-tools: Bash(gh *)
model: haiku
---

## Instructions

Create a GitHub issue based on $ARGUMENTS.

Title format: `type(scope): description`
Scopes: app, component, connection, auth, encryption, migration, api, widget, chart

Labels — always apply type + package + area:

- **Type**: bug, enhancement, security, documentation, performance, urgent, breaking-change, refactor, tech-debt, chore, question
- **Package**: pkg:app, pkg:component, pkg:connection, pkg:cli
- **Area**: area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api, area:a11y, area:params, area:table, area:design, area:devex, area:typography, area:motion, area:ci, area:release
- **Special**: enterprise, release-blocker, blocked, backlog, good first issue, claude, dependencies
