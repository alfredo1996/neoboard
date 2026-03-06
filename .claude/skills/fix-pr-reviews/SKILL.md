---
name: fix-pr-reviews
description: Extract, fix, and resolve all SonarCloud + CodeRabbit bot review issues for a PR.
model: sonnet
allowed-tools: Read, Write, Edit, Bash(gh *), Bash(git *), Bash(npm *), Bash(npx *), Grep(*), Glob(*)
---
## State
- Branch: !`git branch --show-current`
- PR: $ARGUMENTS

## Phase 1 — Extract Issues

Collect all bot review issues from the PR. Use `$ARGUMENTS` as the PR number.
Read `SONAR_TOKEN` from `app/.env.local` (variable name: `SONAR_TOKEN`).

### SonarCloud (direct API — richer than GitHub annotations)

```bash
# Resolve the project key from the SonarCloud check-run details URL
# (usually visible in gh pr checks output, e.g. https://sonarcloud.io/dashboard?id=<project-key>&pullRequest=N)
gh pr checks $ARGUMENTS --json name,detailsUrl \
  --jq '.[] | select(.name | test("sonarcloud"; "i")) | .detailsUrl'

# Query issues for this PR directly from SonarCloud REST API
# Replace <project-key> with the key resolved above
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?projectKeys=<project-key>&pullRequest=$ARGUMENTS&resolved=false" \
  | jq '.issues[] | {key, rule, severity, message, component, line, effort, tags}'

# Severities: BLOCKER, CRITICAL, MAJOR, MINOR, INFO
# Map to fix priority: BLOCKER/CRITICAL=security+bugs, MAJOR=perf+smells, MINOR/INFO=nitpicks
```

### CodeRabbit (GitHub API)

```bash
# Inline review comments
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments \
  --jq '[.[] | select(.user.login == "coderabbitai[bot]")]'

# Top-level PR comments
gh pr view $ARGUMENTS --comments --json comments \
  --jq '[.comments[] | select(.author.login == "coderabbitai[bot]")]'

# Review bodies
gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/reviews \
  --jq '[.[] | select(.user.login == "coderabbitai[bot]")]'
```

**Filter rules:**
- `sonarcloud[bot]`: use direct API results; extract rule key, severity, component (file path), line
- `coderabbitai[bot]`: keep actionable items only; skip already-resolved threads and suggestions explicitly marked as optional/nitpick
- Ignore comments from human reviewers in this pass (address separately)

## Phase 2 — Fix

Apply fixes in priority order: **security > bugs > performance > code smells > nitpicks**

NeoBoard conventions to enforce:
- TypeScript strict — no untyped `any`, explicit return types
- Parameterized queries only — never interpolate user input
- Tenant isolation — `tenant_id` filter on every DB query
- `next/dynamic` + `ssr: false` for all chart/widget components
- Modular ECharts imports (`echarts/core` + specific modules)
- No empty `catch` blocks — handle or rethrow with context
- `can_write` permission enforced server-side in API routes
- Package boundaries: `component/` has no stores/API calls, `connection/` has no React

For CodeRabbit suggestions that include a diff/code block, apply the provided change directly.
For SonarCloud issues, fix at the reported file:line per the rule description.

## Phase 3 — Verify

Run all checks after applying fixes. Do NOT skip any step.

```bash
npx tsc --noEmit
npm run lint
cd app && npm test
```
Run the test skill to see that everything is ok.
Fix any new errors introduced during the review fixes before proceeding.

## Phase 4 — Resolve Conversations (GraphQL)

Resolve only the GitHub review threads that were addressed in Phase 2.

```bash
# Get pull request node ID and all review threads
gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { author { login } body }
            }
          }
        }
      }
    }
  }
' -f owner="{owner}" -f repo="{repo}" -F number=$ARGUMENTS
```

For each thread that was fixed, resolve it:
```bash
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
' -f threadId="<THREAD_NODE_ID>"
```

**Do NOT resolve threads that were not addressed.**

## Phase 5 — Summary Table

Output a markdown table of all issues processed:

| Source | File | Line | Rule / Category | Severity | Fix Applied | Thread Resolved |
|--------|------|------|-----------------|----------|-------------|-----------------|
| sonarcloud[bot] | path/to/file.ts | 42 | typescript:S1234 | MAJOR | Yes — removed unused var | N/A |
| coderabbitai[bot] | path/to/other.ts | 88 | Performance | suggestion | Yes — applied diff block | Yes |

End with a count: `Fixed: N issues · Resolved: M threads · Skipped: K (not addressed)`
