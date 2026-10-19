---
paths:
  - "app/src/**"
  - "component/src/**"
  - "connection/src/**"
  - "connector-sdk/src/**"
  - "cli/src/**"
---

# Codebase graph (graphify)

A tree-sitter graph of this repo answers "what imports, calls or is affected by X" for a fraction of a grep's tokens: `explain` on the query scheduler took ~560 tokens where grep took ~2,500 (#2208). It is optional tooling on the owner's machine; if `graphify` is not on PATH, explore as usual.

- **Fresh before the first query** in a checkout or worktree: if `graphify-out/GRAPH_REPORT.md` is missing, or its "Built from commit" line differs from `git rev-parse --short HEAD`, run `graphify update .` (code only, no model, about 15 s). `graphify-out/` is gitignored.
- **Ask with exact names, not free text.** `graphify explain "<symbol or file>"` lists importers and contents with file:line; `graphify affected "<symbol>()" --depth 1 --relation calls` lists its direct callers (the default depth 2 adds callers of callers: in gemini it found 127 of the 139 call sites grep found, so grep stays the exact count); `graphify path "<A>" "<B>"` shows how two nodes connect; `graphify god-nodes` lists the hubs. An ambiguous name prints the candidates: retry with the node id. Free-text `graphify query` matches words, not meaning, and floods on this repo.
- **Structure only.** The graph knows what connects, never why: the why is in the issue, CLAUDE.md and the vault.
- **Overlapping PRs:** `graphify prs --conflicts --base <active base>` lists open PRs that touch the same code communities, read-only. Never `--triage`: it spends Opus tokens.
- **Never run** `graphify claude install` (adds a PreToolUse hook that intercepts reads) or `graphify hook install` (writes into Husky's generated `.husky/_` and adds a merge driver and a `.gitattributes` line).
