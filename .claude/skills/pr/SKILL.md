---
name: pr
description: Open a NeoBoard pull request, and merge it only at the full bar (every check, CLEAN, SonarCloud metrics, comments read, no E2E test that passed only on retry). Use when a branch is ready for a PR or a PR is ready to merge.
allowed-tools: Bash(gh *), Bash(git *), Bash(npm *), Bash(npx *)
---

# PR — NeoBoard

## State

- Branch: !`git branch --show-current`
- PR base: !`BASE=$(git ls-remote --heads origin 'release/*' | sed 's|.*refs/heads/||' | sort -V | tail -1); printf '%s\n' "${BASE:-dev}"`

## Open

1. **Base:** the active `release/X.Y` (the latest by version) when one exists, otherwise `dev`. Never `main`.
2. **Pre-flight on the branch:** run `git fetch origin && git rebase origin/<base>`, then the checks for what changed (see `test`).
3. **Push:** `git push -u origin HEAD`, as the `alfredo1996` gh account.
4. **Create:** pass labels and milestone at creation. They work there; `gh pr edit` does not on this repo.

   ```bash
   gh pr create --repo alfredo1996/neoboard --base <base> --head <branch> \
     --title "<type>(<scope>): <what now happens> (#<N>)" --body-file pr.md \
     --label <type> --label <pkg> --label <area> --milestone "<milestone>"
   ```

   Body:

   ```markdown
   Closes #<N>

   ## What was wrong

   ## The fix

   ## Drill (minimal)

   ## Tests

   Red-then-green evidence, and what CI covers.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

   Get the body right first time. A body edited after creation may not close its issue on a release branch; if that happens, close the issue by hand with a comment naming the merge commit.

5. **Review:** run `adversarial-reviewer` on the branch before merging (CLAUDE.md, #2180). Send its real findings back to the same `implementer`, to be fixed test-first.

## Merge bar: all of it, checked live, right before merging

1. **Every check passed, none pending:** `gh pr checks <N>`. Right after a push, GitHub can report CLEAN before any check has registered, so count them; CI registers 15 to 19.
2. **The merge state is `CLEAN`:** `gh pr view <N> --json mergeStateStatus`. Never merge on `UNSTABLE`, `BLOCKED` or `UNKNOWN`.
3. **No E2E test failed its first attempt.** CI runs Playwright with `retries: 1`, so a test that fails and then passes on retry still leaves the job green. That hid a red test for four days (#2184). Scan every shard:

   ```bash
   RUN=$(gh run list --repo alfredo1996/neoboard --branch <branch> --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
   for j in $(gh run view "$RUN" --repo alfredo1996/neoboard --json jobs --jq '.jobs[] | select(.name|test("E2E \\(shard")) | .databaseId'); do
     gh api "repos/alfredo1996/neoboard/actions/jobs/$j/logs" | sed -E 's/^[0-9TZ:.-]+ //' | grep -E '^\s+✘'
   done
   ```

   Any output is a failure: root-cause it, and file it if it isn't this PR's. Never re-run until it goes green.

4. **The base is green too:** the base branch's latest push run (`gh run list --branch <base> --workflow ci.yml --limit 1`) passed with no first-attempt failures. A red base means every PR inherits it.
5. **SonarCloud:** the PR comment reads **Quality Gate passed**, with 0 new issues, 0 security hotspots, and coverage on new code of at least 80% wherever there is new code in scope. Sonar scans only the package `src` directories. Read the metrics, not just the check.
6. **Comments:** read every PR comment and inline review comment. CodeRabbit's check is green because it skips this repo (fewer than 10 stars). For a real CodeRabbit pass, run `npm run review:local`.
7. **The base moved after CI ran:** rebase and push for a fresh run. Skip that only when the two changes touch different files and cannot interact, and say why in the PR.

Merge, pinned to the head CI tested:

```bash
gh pr view <N> --json headRefOid,mergeStateStatus
gh pr merge <N> --repo alfredo1996/neoboard --squash --delete-branch --match-head-commit <headRefOid>
```

Then:

- Confirm the issue closed. The close-referenced-issues Action can lag; close it by hand if needed.
- Remove the worktree and the local branch.
- If `.claude/` changed, pull the main checkout: hooks and CLAUDE.md run from its working copy.

**Who decides:** merge only with the owner's go for this base. Their standing permission covers green fixes into the active release branch. A PR that changes a public contract, or does something the owner hasn't seen, goes to them first. `dev` and `main` are the owner's.

$ARGUMENTS = the PR number, or context for a new PR.
