---
name: next
description: Pick the next open NeoBoard issue and take it through drill, implementation, review and PR the way the team works (implementer agent, adversarial-reviewer, merge bar).
disable-model-invocation: true
allowed-tools: Read, Agent, SendMessage, Bash(gh *), Bash(git *), Bash(npm *), Bash(npx *), Bash(cat *), Bash(ls *), Bash(grep *), Bash(head *), Bash(tail *)
---

# Next — NeoBoard

## 1. Pick the issue

If $ARGUMENTS is a number, use that issue. Otherwise:

```bash
BASE=$(git ls-remote --heads origin 'release/*' | sed 's|.*refs/heads/||' | sort -V | tail -1); BASE="${BASE:-dev}"
gh api 'repos/alfredo1996/neoboard/milestones?state=open' --jq '.[] | "\(.number) \(.title) open=\(.open_issues)"'
gh issue list --repo alfredo1996/neoboard --state open --milestone "<the active base's milestone>" --json number,title,labels
```

Start from the milestones of the active base: `vX.Y`, and `vX.Y.1` for bugs found during it. Not the earliest open milestone, which can hold only owner work.

Take the first issue that:

- is not labelled `blocked`, and isn't owner-only work (labelled `area:launch`, or titled `(owner)`);
- has its `Depends on #X` issues closed;
- has no owner decision still open in its comments (`gh issue view <N> --repo alfredo1996/neoboard --json comments`).

Read the relevant notes in `~/Desktop/neoboard-vault` for context.

## 2. Drill

Follow the drill policy in CLAUDE.md and `drill`.

- **A bug with a reproduction:** the issue's default fix stands in for question rounds.
- **A feature, a UX change, or anything touching auth, tenancy, query safety or credentials:** run `/drill <N>` with the owner before anyone branches.

## 3. Implement

Spawn the `implementer` agent with `isolation: "worktree"`. Give it:

- the issue number;
- the base (`$BASE`);
- a free E2E port (`TEST_SERVER_PORT=3400` or above, one per concurrent agent);
- what you already know: the root cause, owner decisions, and constraints such as "don't touch CHANGELOG.md".

It branches inside its own worktree. The main checkout stays on the active release branch, because the hooks and CLAUDE.md run from it. It commits; it does not push.

## 4. Review

Spawn `adversarial-reviewer`. Give it the worktree, the branch, the base, and the implementer's report, as claims to verify.

- Send real findings back to the same implementer with `SendMessage`, not to a new agent.
- Re-review if the fix changed the approach.

## 5. PR and merge

Follow `pr`: push, open with labels and milestone, then merge at the full bar.

## 6. Report

Report:

- the issue;
- what changed;
- the PR link;
- the merge commit;
- anything filed along the way. Bugs found while working go to the patch milestone, see `issue`.
