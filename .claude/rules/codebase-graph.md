---
paths:
  - "app/src/**"
  - "component/src/**"
  - "connection/src/**"
  - "connector-sdk/src/**"
  - "cli/src/**"
---

# Codebase graph (graphify): this repo

The general guide is the owner's `~/.claude/rules/codebase-graph.md`, which loads beside this file on the one machine that has `graphify`. If `graphify` is not on PATH, explore as usual. Only what differs here:

- **Worktrees:** implementers ask the main checkout's graph; only the reviewer runs `graphify update .` in its worktree (about 15 s here).
- **`graphify query` floods on this repo.** Use the exact-name commands.
- **Depths:** `requireSession()` gives 42, then +40, then +14, by hop 3 mostly test helpers.
- **Overlapping PRs:** `graphify prs --conflicts --base <active base>`.
- **The why** is in the issue, CLAUDE.md and the vault.
- **Never `graphify hook install`:** it writes into Husky's generated `.husky/_`.
