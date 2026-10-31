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

- **Worktrees:** an implementer asks the main checkout's graph, with `--graph <main checkout>/graphify-out/graph.json`. The reviewer runs `graphify update .` in its worktree (about 15 s here), and a fixer asks the graph the reviewer left there. After pulling the main checkout, the lead runs `graphify update .` there; until then its graph lags, and grep stays the exact count.
- **`graphify query` floods on this repo.** Use the exact-name commands.
- **Never `graphify hook install`:** it writes into Husky's generated `.husky/_`.
