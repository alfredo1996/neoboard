---
name: test
description: Run the NeoBoard test suites for what changed, against the active base branch, with the gotchas that make local runs lie.
model: haiku
disable-model-invocation: true
allowed-tools: Bash(npm *), Bash(npx *), Bash(git *), Bash(cd *), Bash(node *)
---

# Test — NeoBoard

## State

- Branch: !`git branch --show-current`
- Base: !`BASE=$(git ls-remote --heads origin 'release/*' | sed 's|.*refs/heads/||' | sort -V | tail -1); printf '%s\n' "${BASE:-dev}"`

## 1. What changed

```bash
BASE=$(git ls-remote --heads origin 'release/*' | sed 's|.*refs/heads/||' | sort -V | tail -1); BASE="${BASE:-dev}"
git fetch -q origin "$BASE"
git diff --name-only "origin/$BASE...HEAD"
```

## 2. Before the first run in a fresh worktree

Run `npm ci`, then `npm -w connector-sdk run build && npm -w connection run build`. Without those builds, about 67 app tests fail on module resolution. Never symlink `node_modules` into a worktree.

## 3. Run, per package

| Changed                                                                      | Run                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`                                                                       | `npm -w app run test`, and `npm -w app exec tsc -- --noEmit`                                                                                                                             |
| `component/`                                                                 | `npm -w component run test`                                                                                                                                                              |
| `connector-sdk/`                                                             | `npm -w connector-sdk run test` (Jest), then rebuild it and run the `connection` row. `npm run verify` runs neither suite.                                                               |
| `connection/`                                                                | `npm -w connector-sdk run build && npm -w connection run build`, then `npm -w connection run test`. It needs Docker, and `npm run verify` does NOT run it.                               |
| `cli/`                                                                       | `npm -w cli run test`                                                                                                                                                                    |
| `scripts/` or `.claude/`                                                     | `npm run test:scripts`. To run one file: `npx vitest run scripts/__tests__/<file> --exclude '**/.claude/**'`, because a path filter also matches the copies inside `.claude/worktrees/`. |
| UI (`app/src/app`, `app/src/components`, `app/src/plugins`, `component/src`) | the affected E2E spec, below                                                                                                                                                             |

**E2E:** run only the affected spec, with exactly one `cd` per command, or the commit hook's E2E gate can't see the run.

```bash
cd app && TEST_SERVER_PORT=<port> npx playwright test e2e/<spec>.spec.ts --workers=2 --retries=0 --reporter=dot
```

- Use a free port (3400 or above) when another worktree may be running E2E.
- After a Playwright version bump, run `npx playwright install chromium` once.
- CI's five shards run everything.

## 4. Always

```bash
npm run lint
```

- `npm run build` before a PR that touches `app/`.
- `npm run verify` is the local CI mirror: typecheck, lint, unit suites and script tests. It does not include the connection suite or E2E.

## 5. Report

Report which suites ran and their pass and fail counts, read from both halves of any combined run (`test:scripts` prints Vitest totals, then `node --test` `ℹ fail` totals). Then list any failures to fix.

- `$ARGUMENTS` contains "coverage": also run `npm run test:coverage` in the affected packages.
- `$ARGUMENTS` contains "all": run every suite regardless of changes.
