---
name: issue
description: Create a GitHub issue with proper labels.
disable-model-invocation: true
allowed-tools: Bash(gh *)
model: haiku
---
## Instructions
Create a GitHub issue based on $ARGUMENTS.

Labels — always apply type + package + area:
- Type: bug, enhancement, security, documentation, performance, urgent
- Package: pkg:app, pkg:component, pkg:connection
- Area: area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api
- Special: enterprise, breaking-change, good-first-issue

Title format: `type(scope): description`
