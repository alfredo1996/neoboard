---
name: prioritize
description: Read all open issues, assess priority, produce ranked backlog.
model: opus
context: fork
disable-model-invocation: true
allowed-tools: Read, Bash(gh issue *), Bash(gh api *), Bash(cat *), Bash(grep *)
---
# Prioritize — Opus
Use ultrathink. Fetch all open issues with `gh issue list --state open --limit 100 --json number,title,labels,assignees,createdAt,body`.

For each: assess Impact (1-5), Effort (S/M/L/XL), Autonomous suitability (✅/⚠️/❌).

Priority: P0 (security/blockers), P1 (high-impact), P2 (medium), P3 (backlog).

Output ranked table + Recommended Sprint (top 5) + Issues for auto-implementation.

$ARGUMENTS = optional filters (e.g. 'enterprise only', 'pkg:connection').
