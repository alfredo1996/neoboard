---
name: next
description: Autonomously pick the next issue from the backlog, implement it, test, commit, and open a PR. Zero-input autopilot.
model: sonnet
disable-model-invocation: true
allowed-tools: Read, Write, Edit, MultiEdit, Bash(npm *), Bash(npx *), Bash(git *), Bash(gh *), Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(head *), Bash(tail *), Bash(mkdir *)
---

# Autopilot — Pick next issue, implement, PR

## Step 1 — Find the next issue to work on

```bash
# Get open issues from the current milestone, sorted by priority
gh issue list --state open --assignee @me --limit 5 --json number,title,labels,milestone,body
# If nothing assigned to you, get unassigned issues from the earliest milestone
gh issue list --state open --limit 10 --json number,title,labels,milestone,body --jq '[.[] | select(.assignees | length == 0)] | sort_by(.milestone.title) | .[0:5]'
```

Pick the first issue that:

1. Is in the earliest open milestone
2. Has no unresolved dependencies (check body for 'Depends on #X' — verify those are closed)
3. Is not labeled `blocked`

If $ARGUMENTS is a number, use that issue instead of picking.

## Step 2 — Assign yourself and create a branch

```bash
gh issue edit <number> --add-assignee @me
git checkout dev && git pull origin dev
git checkout -b <type>/<short-description>
```

Branch prefix from labels: bug → fix/, enhancement → feat/, security → security/, docs → docs/.

## Step 3 — Run /drill

Before implementing, run `/drill <number>` to gather requirements, edge cases, and acceptance criteria. This is mandatory per CLAUDE.md.

## Step 4 — Read the issue and relevant docs

Read the full issue body. Check `claude_code_docs/` for relevant context.
Identify which package(s) are affected: app/, component/, connection/.

## Step 5 — Implement

Follow all CLAUDE.md rules. Respect package boundaries.
If building UI, check existing components first (`find component/src -name '*.tsx'`).

## Step 6 — Test and lint

```bash
cd app && npx next lint --fix
npm run lint
npm run build
cd app && npm test
cd component && npm test
cd app && npx playwright test
```

Fix any failures. Do not skip.

## Step 7 — Commit

Use Conventional Commits: `type(scope): description`
Reference the issue: `Closes #<number>`

## Step 8 — Push and create PR

```bash
git push -u origin HEAD
gh pr create \
  --title '<conventional commit title>' \
  --base dev \
  --body '## Summary\n...\n\n## Changes\n...\n\n## Testing\n- [x] Unit tests\n- [x] Lint passes\n- [x] Build passes\n\nCloses #<number>' \
  --label '<labels from the issue>'
```

## Step 9 — Report

Output:

- Issue number and title
- What was implemented
- Files changed
- PR link
- What to review
