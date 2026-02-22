---
name: release-plan
description: Read a product spec or feature doc, break it into milestones and GitHub issues with proper labels, dependencies, and ordering. Use when turning a product spec into an actionable backlog.
model: opus
context: fork
disable-model-invocation: true
allowed-tools: Read, Bash(gh *), Bash(cat *), Bash(find *), Bash(grep *), Bash(ls *)
---
# Release Plan — Opus

Turn a product spec into GitHub milestones and issues. Use ultrathink.

## Input

$ARGUMENTS should be a path to the spec file (e.g. `claude_code_docs/PROJECT.md`) or a description of what to plan.

## Step 1 — Read the spec

Read the file provided in $ARGUMENTS. If no file given, check these locations:
- `claude_code_docs/` — any .md files
- `PROJECT.md`
- `docs/`

## Step 2 — Define releases

Group features into logical releases (milestones). Consider:
- Dependencies: what must exist before something else can be built
- Risk: security and data-integrity features early
- Value: core user-facing features before nice-to-haves
- Enterprise: enterprise features come after the open-source foundation

For each release, give it a name (e.g. `v0.1 — Core Foundation`) and a one-line goal.

## Step 3 — Break into issues

For each feature in the spec, create a GitHub issue with:
- Title: `type(scope): description` (Conventional Commits style)
- Body: acceptance criteria from the spec + technical notes
- Labels: type + package + area (from our taxonomy)
- Milestone: which release it belongs to

Order within each milestone by dependency — things that block others come first.

## Step 4 — Create milestones on GitHub

```bash
gh api repos/{owner}/{repo}/milestones -f title='v0.1 — Core Foundation' -f description='...'
```

## Step 5 — Create issues on GitHub

For each issue, use `gh issue create` with title, body, labels, and milestone.
Add dependency notes in the body (e.g. 'Depends on #12').

## Step 6 — Summary

Output a markdown summary:

```
# Release Plan

## v0.1 — Core Foundation
Goal: ...
Issues: #1, #2, #3, #4
Estimated effort: ...

## v0.2 — Dashboard Experience
Goal: ...
Issues: #5, #6, #7, #8
Depends on: v0.1
...
```

Save to `claude_code_docs/release-plan.md`.
