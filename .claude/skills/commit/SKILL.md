---
name: commit
description: Stage and commit changes using Conventional Commits.
disable-model-invocation: true
allowed-tools: Bash(git *)
model: haiku
---
## Current state
- Status: !`git status --short`
- Recent: !`git log --oneline -5`
- Branch: !`git branch --show-current`

## Instructions
1. Stage relevant changes
2. Commit with Conventional Commits: `type(scope): description`
3. Types: feat, fix, chore, docs, refactor, test, perf, security
4. Scopes: app, component, connection, auth, encryption, migration, api, widget, chart
5. Do NOT push

$ARGUMENTS = guidance for commit message.
