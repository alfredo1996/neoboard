---
name: pr
description: Create a GitHub PR with labels, conventional commit title, structured body.
model: haiku
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(npm *)
---

## State

- Branch: !`git branch --show-current`
- Commits: !`git log origin/dev..HEAD --oneline 2>/dev/null || echo 'No upstream'`
- Changed: !`git diff origin/dev --name-only 2>/dev/null || git diff --name-only`

## Conventions

- Branch prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `security/`
- Commits: `type(scope): description`
- Scopes: app, component, connection, auth, encryption, migration, api, widget, chart

## Pre-flight (fix failures before creating PR)

1. `git fetch origin && git rebase origin/dev` (PRs always target `dev`; exception: target `release/X.Y` if active)
2. `npm run lint`
3. `npm run build`
4. Run tests for affected packages (`cd app && npm test`, `cd component && npm test`)
5. Run E2E if UI changed: `cd app && npx playwright test`
6. If updating existing PR: `gh pr view <number> --comments` — address CodeRabbit/SonarCloud feedback

## Labels (required: type + package)

- Type: bug, enhancement, security, documentation, breaking-change, performance
- Package: pkg:app, pkg:component, pkg:connection
- Area: area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api
- Special: enterprise, breaking-change

## PR body template

```
## Summary
[1-2 sentences]
## Changes
- [bullets]
## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests pass
## Related Issues
Closes #[number]
```

$ARGUMENTS = context for PR description.
