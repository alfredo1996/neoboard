---
name: pr
description: Create a GitHub PR with labels, conventional commit title, structured body.
model: haiku
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(npm *)
---

## State

- Branch: !`git branch --show-current`
- PR base: !`BASE=$(git ls-remote --heads origin 'release/*' | sed 's|.*refs/heads/||' | sort -V | tail -1); printf '%s\n' "${BASE:-dev}"`

## Conventions

- Branch prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `security/`
- Commits: `type(scope): description`
- Scopes: app, component, connection, auth, encryption, migration, api, widget, chart

## Pre-flight (fix failures before creating PR)

1. `git fetch origin && git rebase origin/<base>`, where the base is the active release branch above, or `dev` when there is none. Target the same base in the PR.
2. `npm run lint`
3. `npm run build`
4. Run tests for affected packages (`cd app && npm test`, `cd component && npm test`)
5. Run E2E if UI changed: `cd app && npx playwright test <affected spec>` (CI's shards run the full suite)
6. If updating existing PR: `gh pr view <number> --comments` — address CodeRabbit/SonarCloud feedback

## Labels (required: type + package + area)

Use the label list in the `github-workflow` skill, exactly as named there.

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
