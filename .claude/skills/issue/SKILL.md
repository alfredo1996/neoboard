---
name: issue
description: File a NeoBoard GitHub issue in the house format (problem, reproduction, cause, expected, a default fix the owner can override, required tests) with labels and milestone set. Use when a bug, task or finding needs filing.
allowed-tools: Bash(gh *), Bash(git *)
---

# Issue — NeoBoard

## Where it goes

- **Repo:** `alfredo1996/neoboard` (public) by default. Use the private `neoboard-enterprise` repo only for `enterprise/` code, gated features, or security detail that must not be public yet.
- **Milestone:** a bug found while working on release X.Y goes to the patch milestone `vX.Y.1`. Create the milestone if it is missing.
  - While `release/X.Y` is untagged, the fix still branches from and merges into it, and ships in X.Y.0. The milestone records when the bug was found.
  - A bug that blocks the release moves to `vX.Y` instead.
- **Scope:** don't fix it inside the PR you are on. One issue gets one PR.

## Title

`type(scope): what is wrong, in user terms`. For example: `fix(dashboard): an open dashboard never recovers by itself after its database comes back`. Types and scopes are in `github-workflow`.

## Body

```markdown
## Problem

What happens, who it hits, and how it was found, with the date. Evidence: error text, counts, run ids.

## Reproduction

Numbered steps a stranger can follow.

## Cause

What the code does and why, naming the file and function. If it isn't known yet, say "not yet known" and rank the hypotheses with what would tell them apart.

## Expected

The behaviour after the fix.

## Fix (default; the owner can override in a comment)

- The change, made where every caller routes: the root cause, not only the path the report named.
- Not chosen: the alternative, and why.
- Out of scope.

## Required tests

Layer by layer (Vitest unit, jsdom component, Playwright E2E, as the testing rules split them), each saying what it asserts.
The reproduction is the E2E test, and the cause points at the unit test.
A test that still passes with the fix reverted doesn't count.
```

## File it

```bash
gh api 'repos/alfredo1996/neoboard/milestones?state=open' --jq '.[] | "\(.number) \(.title)"'
gh api repos/alfredo1996/neoboard/issues -X POST \
  -f title='…' -F body=@issue.md -F milestone=<number> \
  -f 'labels[]=<type>' -f 'labels[]=<pkg>' -f 'labels[]=<area>' -f 'labels[]=<priority>'
```

- **Labels:** type, package, area and priority, named exactly as in `github-workflow`.
- **Editing later:** `gh issue edit` and `gh pr edit` fail on this repo with a Projects (classic) GraphQL error and set nothing. Use REST instead:
  - `gh api -X PATCH repos/alfredo1996/neoboard/issues/<N> -F milestone=<n>` for the milestone or body;
  - `gh api -X POST repos/alfredo1996/neoboard/issues/<N>/labels -f 'labels[]=…'` for labels.
- **Account:** file, label and merge as the `alfredo1996` gh account. Check with `gh auth status`.
- **No fallbacks that post:** never write a command like `gh issue comment … || …`. A fallback once posted a placeholder publicly.

$ARGUMENTS = what to file.
