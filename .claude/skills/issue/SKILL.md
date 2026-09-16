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

Labels — always apply type + package + area. Use the label list in the `github-workflow` skill, exactly as named there.
