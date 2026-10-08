---
name: code
description: Implement features, fix bugs and refactor in NeoBoard. An issue goes through the implementer and adversarial-reviewer agents; a small change with no issue is done directly, test-first, in a worktree.
allowed-tools: Read, Write, Edit, MultiEdit, Agent, SendMessage, Bash(npm *), Bash(npx *), Bash(git *), Bash(gh *), Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(head *), Bash(tail *), Bash(mkdir *)
---

# Code — NeoBoard

## State

- Branch: !`git branch --show-current`
- Status: !`git status --short`

## Before coding

1. **Issue:** read it with `gh issue view <N> --repo alfredo1996/neoboard --json title,body,labels,comments`. Owner decisions live in the comments. See `github-workflow` for the read forms that work here.
2. **Drill:** follow the drill policy in CLAUDE.md and `drill`.
3. **Existing PR:** read its conversation with `gh pr view <N> --repo alfredo1996/neoboard --json comments,reviews`, plus its inline comments with `gh api repos/alfredo1996/neoboard/pulls/<N>/comments`.
4. **Package:** `component/` is UI only, `connection/` is databases only, `app/` orchestrates. Respect the boundaries.
5. **Context:** read the relevant notes in `~/Desktop/neoboard-vault` (architecture, decisions, security).

## Who implements

- **An issue:** delegate it, as CLAUDE.md requires (#2180).
  - The `implementer` agent works in its own worktree (`isolation: "worktree"`) and commits without pushing.
  - Then `adversarial-reviewer` reviews it, and its real findings go back to the same implementer.
  - Then `pr` opens the PR and merges it at the bar.
- **A small change with no issue:** do it yourself in a worktree, never on the main checkout's branch, because the hooks run from that working copy:

  ```bash
  BASE=$(git ls-remote --heads origin 'release/*' | sed 's|.*refs/heads/||' | sort -V | tail -1); BASE="${BASE:-dev}"
  git worktree add .claude/worktrees/<name> -b <type>/<slug> "origin/$BASE"
  ```

  A fresh worktree needs `npm ci`, then `npm -w connector-sdk run build && npm -w connection run build`. Never symlink `node_modules`.

## TDD (mandatory)

1. **Red:** write a failing test for the behaviour, run it, and see it fail.
2. **Green:** write the minimum code that passes.
3. **Refactor:** tidy up with the tests still green.

A test that still passes with the change reverted doesn't count. UI changes include the affected E2E spec.

## Standards

- TypeScript strict. Any `any` gets a comment explaining why.
- Parameterized queries only. Never modify or wrap a user's query.
- Read-only by default: `BEGIN READ ONLY` for PostgreSQL, session access modes for Neo4j.
- Lazy-load charts with `next/dynamic` and `ssr: false`. Import ECharts modules, never the barrel.
- Keep `void` on a promise you don't await, and use one import per module. SonarCloud flags both.

## After coding

Run what you touched (see `test`): the specific test files, the package typecheck, `npx eslint <files>`, and the affected E2E spec, for example `npx playwright test e2e/<spec>.spec.ts`. CI's five shards run the full suite.

## Base branch

The base is the active `release/X.Y` when one exists, otherwise `dev`. Never `main`.

$ARGUMENTS = an issue number or a task description.
