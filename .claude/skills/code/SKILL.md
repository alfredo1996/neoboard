---
name: code
description: Implement features, fix bugs, refactor. For ALL coding tasks. Reads issue if given a number.
model: sonnet
allowed-tools: Read, Write, Edit, MultiEdit, Bash(npm *), Bash(npx *), Bash(git *), Bash(gh *), Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(head *), Bash(tail *), Bash(mkdir *)
---
# Code — NeoBoard

## State
- Branch: !`git branch --show-current`
- Status: !`git status --short`

## Before coding
1. If issue number: `gh issue view <number>`
2. If existing PR: `gh pr view <number> --comments` — check CodeRabbit & SonarQube feedback
3. Identify package: component/ (UI only), connection/ (DB only), app/ (orchestration)
4. Read relevant docs in `claude_code_docs/` (especially `v04-widget-power.md` for v0.4 issues)

## TDD Workflow (mandatory — no exceptions)
1. **Red** — Write a failing test describing the expected behavior. Run it. Confirm it fails.
2. **Green** — Write the minimum code to make the test pass. No gold-plating.
3. **Refactor** — Clean up without breaking tests.

Do NOT write implementation before the test. Do NOT skip this for "small" changes. This step also includes e2e testing.

## Standards
- TypeScript strict. No `any`.
- Parameterized queries only.
- Read-only: `BEGIN READ ONLY` (PG), session access modes (Neo4j).
- Lazy load charts: `next/dynamic` + `ssr: false`.
- ECharts: modular imports only.

## After coding
```bash
cd app && npx next lint --fix
npm run build
cd app && npm test
```

$ARGUMENTS = task description or issue number.
