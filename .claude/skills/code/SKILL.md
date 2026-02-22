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
2. Identify package: component/ (UI only), connection/ (DB only), app/ (orchestration)
3. Read relevant docs in `claude_code_docs/` if needed

## Standards
- TypeScript strict. No `any`.
- Parameterized queries only.
- Read-only: `BEGIN READ ONLY` (PG), session access modes (Neo4j).
- Lazy load charts: `next/dynamic` + `ssr: false`.
- ECharts: modular imports only.
- New behavior = new tests.

## After coding
```bash
cd app && npx next lint --fix
npm run build
cd app && npm test
```

$ARGUMENTS = task description or issue number.
