#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# NeoBoard — Claude Code Setup Script
# ============================================================
# Run from your project root: ./scripts/setup-claude.sh
#
# What it does:
#   1. Creates/updates .claude/ (skills, agents, settings)
#   2. Updates .mcp.json with useful MCPs
#   3. Sets up GitHub workflow (OAuth, Pro plan)
#   4. Creates GitHub labels
#   5. Generates OAuth token for GitHub Actions
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - claude CLI installed
#   - Docker running (for Neo4j/Postgres MCPs)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   NeoBoard — Claude Code Setup           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ----------------------------------------------------------
# 1. CLAUDE.md
# ----------------------------------------------------------
info "Checking CLAUDE.md..."
if [ -f "CLAUDE.md" ]; then
    log "CLAUDE.md already exists — skipping (review it manually)"
else
    info "Creating CLAUDE.md..."
    cat > CLAUDE.md << 'CLAUDEMD'
# NeoBoard

Open-source dashboarding tool for hybrid database architectures (Neo4j + PostgreSQL).

## Tech Stack

Next.js 15 (App Router), React 19, TypeScript, shadcn/ui, Tailwind CSS, ECharts, Neo4j NVL, Leaflet, Zustand, TanStack Query, Auth.js v5, Drizzle ORM, Vitest, Playwright, Testcontainers.

## Architecture — Three Packages (STRICT boundaries)

- `app/` — Next.js application. API routes, stores, hooks, pages. Orchestrates the other two.
- `component/` — React UI library. **NO business logic. NO API calls. NO stores. NO imports from app/.**
- `connection/` — DB connector library. **NO UI. NO React. NO imports from app/ or component/.**

Before editing any file, check which package it belongs to and respect its boundary.

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build (also type-checks)
npm run test         # Vitest
npm run test:e2e     # Playwright
npm run lint         # Check
npm run lint:fix     # Auto-fix
npm run storybook    # Component library viewer
npm run db:migrate   # Drizzle migrations
npm run db:generate  # Generate migration from schema
docker compose up    # Start Neo4j + PostgreSQL dev containers
```

## Working Rules

- Run `npm run lint:fix` after every change.
- Run `npm run build` before committing to catch type errors.
- New behavior = new tests. No exceptions.
- Use Conventional Commits: `type(scope): description`.
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `security/`.
- PRs need labels: type + package + area. See `/github` skill.
- TypeScript strict. No `any` without a comment explaining why.
- Use `npm`, not `pnpm` or `yarn`.

## Query Safety — DO NOT VIOLATE

- NEVER modify or wrap user queries. Safety is enforced at the driver/transaction level.
- ALWAYS use parameterized queries. NEVER interpolate user input into query strings.
- PostgreSQL read-only: `BEGIN READ ONLY` transactions for non-Form widgets.
- Neo4j read-only: session access modes.
- Row limits: cursor/stream consumption with MAX_ROWS+1 pattern. Never add LIMIT to user queries.
- Timeouts: enforced at driver level (AbortSignal for pg, native for Neo4j). Default 30s.
- Concurrency: per-connector `p-queue`. One queue per connector.
- `can_write` permission: ALWAYS enforced server-side in the API route, not just UI.

## Credentials — DO NOT VIOLATE

- NEVER log decrypted credentials.
- NEVER store encryption keys in the database.
- Encryption uses AES-256-GCM envelope scheme (HKDF-SHA256 key derivation).
- Lost ENCRYPTION_KEY = all credentials unrecoverable. Always warn users about this.

## Multi-Tenancy

- `tenant_id` column on ALL tables. Every DB query MUST include tenant filter at ORM/middleware level.
- JWT tokens include `tenantId` claim. Validate before ANY DB or API access.
- SaaS vs on-prem: env vars only, never code branches.

## Charts & Widgets

- Chart components MUST use `next/dynamic` with `ssr: false`. No exceptions.
- ECharts: import from `echarts/core` + specific modules. NEVER `import * as echarts from 'echarts'`.
- Heavy deps (NVL, Leaflet) loaded only when a widget of that type is on the current dashboard.
- Check existing components in `component/src/` and Storybook before creating new ones.

## Enterprise Features

Gated by env vars, not code branches. Must fall back gracefully when not licensed.
Includes: SSO, Custom Roles, Connector Labels, Bulk Import, Connector CRUD API, Dashboard Sharing Links, Query Result Caching, Environment Selector, Connector Alias.

## Detailed Docs

Read `claude_code_docs/` before working on specific areas. These contain implementation details, patterns, and examples that don't belong in this file.

## Migrations

Forward-only. Idempotent. Advisory lock prevents concurrent runs.
Test version-skip paths. `--skip-migrations` flag exists for emergency debugging.
CLAUDEMD
    log "Created CLAUDE.md"
fi

# ----------------------------------------------------------
# 2. .claude/ directory structure
# ----------------------------------------------------------
info "Setting up .claude/ directory..."

mkdir -p .claude/skills/{code,commit,issue,pr,review,plan,prioritize,github-workflow,components,release-plan,next}
mkdir -p .claude/agents

# --- Settings ---
if [ ! -f ".claude/settings.json" ]; then
    cat > .claude/settings.json << 'SETTINGS'
{
  "permissions": {
    "allow": [
      "Bash(npm *)", "Bash(npx *)", "Bash(gh *)", "Bash(git *)",
      "Bash(node *)", "Bash(cat *)", "Bash(ls *)", "Bash(find *)",
      "Bash(grep *)", "Bash(head *)", "Bash(tail *)", "Bash(wc *)",
      "Bash(echo *)", "Bash(mkdir *)", "Bash(cp *)", "Bash(mv *)",
      "Bash(docker compose *)",
      "Read(*)", "Edit(*)", "Write(*)"
    ],
    "deny": [
      "Bash(rm -rf /)", "Bash(rm -rf ~)",
      "Edit(.env*)", "Write(.env*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "[ \"$(git branch --show-current)\" != \"main\" ] || { echo 'Cannot edit on main. Create a feature branch first.' >&2; exit 2; }",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "FILE_PATH=$(echo \"$CLAUDE_FILE_PATHS\" | head -1); if echo \"$FILE_PATH\" | grep -qE '\\.(ts|tsx)$'; then npx prettier --write \"$FILE_PATH\" 2>/dev/null; fi",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
SETTINGS
    log "Created .claude/settings.json (hooks + permissions)"
else
    log ".claude/settings.json already exists — skipping"
fi

# --- .gitignore ---
if [ ! -f ".claude/.gitignore" ]; then
    echo "settings.local.json" > .claude/.gitignore
    log "Created .claude/.gitignore"
fi

# --- Skills ---
write_skill() {
    local dir="$1" content="$2"
    if [ ! -f ".claude/skills/$dir/SKILL.md" ]; then
        echo "$content" > ".claude/skills/$dir/SKILL.md"
        log "Created skill: $dir"
    else
        log "Skill $dir already exists — skipping"
    fi
}

write_skill "commit" "---
name: commit
description: Stage and commit changes using Conventional Commits.
disable-model-invocation: true
allowed-tools: Bash(git *)
model: haiku
---
## Current state
- Status: !\`git status --short\`
- Recent: !\`git log --oneline -5\`
- Branch: !\`git branch --show-current\`

## Instructions
1. Stage relevant changes
2. Commit with Conventional Commits: \`type(scope): description\`
3. Types: feat, fix, chore, docs, refactor, test, perf, security
4. Scopes: app, component, connection, auth, encryption, migration, api, widget, chart
5. Do NOT push

\$ARGUMENTS = guidance for commit message."

write_skill "issue" "---
name: issue
description: Create a GitHub issue with proper labels.
disable-model-invocation: true
allowed-tools: Bash(gh *)
model: haiku
---
## Instructions
Create a GitHub issue based on \$ARGUMENTS.

Labels — always apply type + package + area:
- Type: bug, enhancement, security, documentation, performance, urgent
- Package: pkg:app, pkg:component, pkg:connection
- Area: area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api
- Special: enterprise, breaking-change, good-first-issue

Title format: \`type(scope): description\`"

write_skill "code" "---
name: code
description: Implement features, fix bugs, refactor. For ALL coding tasks. Reads issue if given a number.
allowed-tools: Read, Write, Edit, MultiEdit, Bash(npm *), Bash(npx *), Bash(git *), Bash(gh *), Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(head *), Bash(tail *), Bash(mkdir *)
---
# Code — NeoBoard

No model pin — smart switching handles routing (Haiku for simple, Sonnet for complex).

## State
- Branch: !\`git branch --show-current\`
- Status: !\`git status --short\`

## Before coding
1. If issue number: \`gh issue view <number>\`
2. Identify package: component/ (UI only), connection/ (DB only), app/ (orchestration)
3. Read relevant docs in \`claude_code_docs/\` if needed

## Standards
- TypeScript strict. No \`any\`.
- Parameterized queries only.
- Read-only: \`BEGIN READ ONLY\` (PG), session access modes (Neo4j).
- Lazy load charts: \`next/dynamic\` + \`ssr: false\`.
- ECharts: modular imports only.
- New behavior = new tests.

## After coding
\`\`\`bash
npm run lint:fix
npm run build
npm run test
\`\`\`

\$ARGUMENTS = task description or issue number."

write_skill "pr" "---
name: pr
description: Create a GitHub PR with labels, conventional commit title, structured body.
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(git *), Bash(npm *)
---
## State
- Branch: !\`git branch --show-current\`
- Commits: !\`git log origin/main..HEAD --oneline 2>/dev/null || echo 'No upstream'\`
- Changed: !\`git diff origin/main --name-only 2>/dev/null || git diff --name-only\`

## Pre-flight (fix failures before creating PR)
1. \`git fetch origin && git rebase origin/main\`
2. \`npm run lint\`
3. \`npm run build\`
4. \`npm run test\`

## Labels (required: type + package)
- Type: bug, enhancement, security, documentation, breaking-change, performance
- Package: pkg:app, pkg:component, pkg:connection
- Area: area:auth, area:connectors, area:widgets, area:charts, area:query-exec, area:dashboard, area:api
- Special: enterprise, breaking-change

## PR body template
\`\`\`
## Summary
[1-2 sentences]
## Changes
- [bullets]
## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests pass
## Related Issues
Closes #[number]
\`\`\`

\$ARGUMENTS = context for PR description."

write_skill "review" "---
name: review
description: Review changes for code quality, security, and NeoBoard conventions.
model: sonnet
context: fork
allowed-tools: Read, Bash(gh *), Bash(git *), Grep(*), Glob(*)
---
## State
- Branch: !\`git branch --show-current\`
- Changed: !\`git diff origin/main --name-only 2>/dev/null || git diff --name-only\`

## Checklist
Use ultrathink.

### 🔴 Critical
- No credentials logged. Parameterized queries. Read-only transactions.
- can_write server-side. Tenant isolation via tenant_id.
- Timeouts at driver level. Row limits via cursor/stream.

### 🟡 Warning
- component/ has no business logic/stores. connection/ has no UI.
- Charts: next/dynamic + ssr:false. ECharts modular imports.
- No untyped any. Explicit return types.

### 🔵 Suggestion
- Tests for new behavior? JSDoc on complex functions?

Output: \`[SEVERITY] file:line — Issue → Fix\`
End with: ✅ APPROVE, ⚠️ REQUEST CHANGES, or 💬 NEEDS DISCUSSION"

write_skill "plan" "---
name: plan
description: Architecture plan for complex features. Analyzes impact, security, scalability, breaks into tasks.
model: opus
context: fork
allowed-tools: Read, Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(gh *), Bash(git log *)
---
# Plan — Opus
Use ultrathink. Analyze: requirements, architecture impact, security, scalability, dependencies.
Read relevant docs in \`claude_code_docs/\`.

Output a plan with: Summary, Architecture Decision, Affected Packages, Ordered Tasks (S/M/L), Migration needed?, Security Checklist, Testing Strategy, Risks, Suggested GitHub Issues.

Save to \`claude_code_docs/plans/\`.

\$ARGUMENTS = feature or change to plan."

write_skill "prioritize" "---
name: prioritize
description: Read all open issues, assess priority, produce ranked backlog.
model: opus
context: fork
disable-model-invocation: true
allowed-tools: Read, Bash(gh issue *), Bash(gh api *), Bash(cat *), Bash(grep *)
---
# Prioritize — Opus
Use ultrathink. Fetch all open issues with \`gh issue list --state open --limit 100 --json number,title,labels,assignees,createdAt,body\`.

For each: assess Impact (1-5), Effort (S/M/L/XL), Autonomous suitability (✅/⚠️/❌).

Priority: P0 (security/blockers), P1 (high-impact), P2 (medium), P3 (backlog).

Output ranked table + Recommended Sprint (top 5) + Issues for auto-implementation.

\$ARGUMENTS = optional filters (e.g. 'enterprise only', 'pkg:connection')."

write_skill "release-plan" "---
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

\$ARGUMENTS should be a path to the spec file (e.g. \`claude_code_docs/PROJECT.md\`) or a description of what to plan.

## Step 1 — Read the spec

Read the file provided in \$ARGUMENTS. If no file given, check these locations:
- \`claude_code_docs/\` — any .md files
- \`PROJECT.md\`
- \`docs/\`

## Step 2 — Define releases

Group features into logical releases (milestones). Consider:
- Dependencies: what must exist before something else can be built
- Risk: security and data-integrity features early
- Value: core user-facing features before nice-to-haves
- Enterprise: enterprise features come after the open-source foundation

For each release, give it a name (e.g. \`v0.1 — Core Foundation\`) and a one-line goal.

## Step 3 — Break into issues

For each feature in the spec, create a GitHub issue with:
- Title: \`type(scope): description\` (Conventional Commits style)
- Body: acceptance criteria from the spec + technical notes
- Labels: type + package + area (from our taxonomy)
- Milestone: which release it belongs to

Order within each milestone by dependency — things that block others come first.

## Step 4 — Create milestones on GitHub

\`\`\`bash
gh api repos/{owner}/{repo}/milestones -f title='v0.1 — Core Foundation' -f description='...'
\`\`\`

## Step 5 — Create issues on GitHub

For each issue, use \`gh issue create\` with title, body, labels, and milestone.
Add dependency notes in the body (e.g. 'Depends on #12').

## Step 6 — Summary

Output a markdown summary:

\`\`\`
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
\`\`\`

Save to \`claude_code_docs/release-plan.md\`."

write_skill "next" "---
name: next
description: Autonomously pick the next issue from the backlog, implement it, test, commit, and open a PR. Zero-input autopilot.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, MultiEdit, Bash(npm *), Bash(npx *), Bash(git *), Bash(gh *), Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(head *), Bash(tail *), Bash(mkdir *)
---
# Autopilot — Pick next issue, implement, PR

## Step 1 — Find the next issue to work on

\`\`\`bash
# Get open issues from the current milestone, sorted by priority
gh issue list --state open --assignee @me --limit 5 --json number,title,labels,milestone,body
# If nothing assigned to you, get unassigned issues from the earliest milestone
gh issue list --state open --limit 10 --json number,title,labels,milestone,body --jq '[.[] | select(.assignees | length == 0)] | sort_by(.milestone.title) | .[0:5]'
\`\`\`

Pick the first issue that:
1. Is in the earliest open milestone
2. Has no unresolved dependencies (check body for 'Depends on #X' — verify those are closed)
3. Is not labeled \`blocked\`

If \$ARGUMENTS is a number, use that issue instead of picking.

## Step 2 — Assign yourself and create a branch

\`\`\`bash
gh issue edit <number> --add-assignee @me
git checkout main && git pull origin main
git checkout -b <type>/<short-description>
\`\`\`

Branch prefix from labels: bug → fix/, enhancement → feat/, security → security/, docs → docs/.

## Step 3 — Read the issue and relevant docs

Read the full issue body. Check \`claude_code_docs/\` for relevant context.
Identify which package(s) are affected: app/, component/, connection/.

## Step 4 — Implement

Follow all CLAUDE.md rules. Respect package boundaries.
If building UI, check existing components first (\`find component/src -name '*.tsx'\`).

## Step 5 — Test and lint

\`\`\`bash
npm run lint:fix
npm run build
npm run test
\`\`\`

Fix any failures. Do not skip.

## Step 6 — Commit

Use Conventional Commits: \`type(scope): description\`
Reference the issue: \`Closes #<number>\`

## Step 7 — Push and create PR

\`\`\`bash
git push -u origin HEAD
gh pr create \\
  --title '<conventional commit title>' \\
  --body '## Summary\n...\n\n## Changes\n...\n\n## Testing\n- [x] Unit tests\n- [x] Lint passes\n- [x] Build passes\n\nCloses #<number>' \\
  --label '<labels from the issue>'
\`\`\`

## Step 8 — Report

Output:
- Issue number and title
- What was implemented
- Files changed
- PR link
- What to review"

write_skill "github-workflow" "---
name: github
description: GitHub conventions, labels, branching for NeoBoard.
---
# Branch: feat/, fix/, chore/, docs/, refactor/, security/
# Commits: type(scope): description
# Scopes: app, component, connection, auth, encryption, migration, api, widget, chart
# Labels: type (bug/enhancement/security/...) + package (pkg:app/pkg:component/pkg:connection) + area"

write_skill "components" "---
name: components
description: Build UI using NeoBoard's existing component library. Use when creating pages, widgets, dashboards, or any user-facing UI. Reads Storybook stories to understand available components before writing new code.
allowed-tools: Read, Write, Edit, MultiEdit, Bash(npm *), Bash(npx *), Bash(find *), Bash(cat *), Bash(grep *), Bash(ls *)
---
# NeoBoard Component Library

Before building any UI, understand what already exists. Do NOT create new components when an existing one works.

## Step 1 — Discover existing components

Read the component library to understand what's available:

\`\`\`bash
# Find all component source files
find component/src -name '*.tsx' -not -name '*.test.*' -not -name '*.stories.*' | head -40

# Find all Storybook stories (these show usage patterns)
find component/src -name '*.stories.tsx' | head -40

# Read a story to understand a component's API and variants
cat component/src/charts/BarChart.stories.tsx
\`\`\`

## Step 2 — Check before creating

Before writing a new component, search for existing ones:

\`\`\`bash
# Search by name
grep -rl 'export.*Button\|export.*Card\|export.*Modal' component/src/
# Search by functionality
grep -rl 'dropdown\|select\|tooltip\|dialog' component/src/
\`\`\`

## Step 3 — Compose from existing

NeoBoard UI is built by composing from these layers:
1. **shadcn/ui** — Base primitives (Button, Dialog, Input, Select, etc.)
2. **component/** — NeoBoard components built on shadcn (charts, widgets, parameter selectors)
3. **app/** — Pages and layouts that compose NeoBoard components

Always prefer: shadcn primitive → existing NeoBoard component → new component (last resort).

## Step 4 — If creating a new component

Put it in \`component/src/\` following these rules:
- Props-driven, no internal API calls or store access
- Use shadcn/ui primitives as building blocks
- Tailwind for styling
- Add a Storybook story showing all variants
- Add unit tests
- Export from the package index

## Step 5 — Storybook

After modifying or adding components:
\`\`\`bash
# Run Storybook to visually verify
npm run storybook
\`\`\`

\$ARGUMENTS = what to build or which component to modify."

# --- Agents ---
if [ ! -f ".claude/agents/code-reviewer.md" ]; then
    cat > .claude/agents/code-reviewer.md << 'AGENT'
---
name: code-reviewer
description: Reviews code for quality, security, and NeoBoard conventions.
model: sonnet
---
Senior reviewer for NeoBoard. Priority: 1) Security (credentials, parameterized queries, read-only, tenant isolation) 2) Query safety (timeouts, row limits, concurrency) 3) Architecture boundaries (component=UI, connection=DB, app=orchestration) 4) Performance (lazy loading, modular ECharts) 5) TypeScript strict 6) Tests.
AGENT
    log "Created agent: code-reviewer"
fi

# ----------------------------------------------------------
# 3. .mcp.json
# ----------------------------------------------------------
info "Checking .mcp.json..."
echo ""
echo "  Current MCPs: shadcn, context7"
echo "  Recommended additions:"
echo ""
echo "  📦 github    — Read/create issues, PRs, review code"
echo "                 Needs: GITHUB_TOKEN env var"
echo ""
echo "  ✨ magic-ui  — Animated React+Tailwind components (marquees, fades, etc.)"
echo "                 Complements shadcn for polished UI"
echo ""

read -p "  Add recommended MCPs to .mcp.json? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Backup existing
    cp .mcp.json .mcp.json.backup 2>/dev/null || true

    # Check for GITHUB_TOKEN
    if [ -z "${GITHUB_TOKEN:-}" ]; then
        warn "GITHUB_TOKEN not set. GitHub MCP won't work until you set it."
        echo "  Run: export GITHUB_TOKEN=\$(gh auth token)"
        echo "  Or add to your shell profile."
    fi

    # Merge MCPs using node (safe JSON manipulation)
    node -e "
    const fs = require('fs');
    const existing = JSON.parse(fs.readFileSync('.mcp.json', 'utf8'));

    const additions = {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '\${GITHUB_TOKEN}' }
      },
      'magic-ui': {
        command: 'npx',
        args: ['-y', 'magic-ui-mcp']
      }
    };

    for (const [name, config] of Object.entries(additions)) {
      if (!existing.mcpServers[name]) {
        existing.mcpServers[name] = config;
        console.log('  ✓ Added: ' + name);
      } else {
        console.log('  → Already exists: ' + name);
      }
    }

    fs.writeFileSync('.mcp.json', JSON.stringify(existing, null, 2) + '\n');
    "

    log ".mcp.json updated (backup at .mcp.json.backup)"
else
    log "Skipped MCP setup"
fi

# ----------------------------------------------------------
# 4. GitHub workflow
# ----------------------------------------------------------
info "Setting up GitHub workflow..."
mkdir -p .github/workflows

if [ ! -f ".github/workflows/claude.yml" ]; then
    cat > .github/workflows/claude.yml << 'WORKFLOW'
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && github.event.action == 'assigned' && github.event.assignee.login == 'claude-bot') ||
      (github.event_name == 'issues' && github.event.action == 'labeled' && github.event.label.name == 'claude') ||
      (github.event_name == 'issues' && github.event.action == 'opened' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          assignee_trigger: "claude-bot"
          label_trigger: "claude"
          claude_args: |
            --max-turns 10
            --model claude-sonnet-4-6
            --allowedTools "Read,Write,Edit,MultiEdit,Bash(npm *),Bash(npx *),Bash(git *),Bash(gh *),Bash(cat *),Bash(ls *),Bash(find *),Bash(grep *)"
            --append-system-prompt "NeoBoard project. Follow CLAUDE.md. Conventional Commits. Proper labels. Run tests. Be token-efficient."
WORKFLOW
    log "Created .github/workflows/claude.yml"
else
    log ".github/workflows/claude.yml already exists — skipping"
fi

# ----------------------------------------------------------
# 5. GitHub Labels
# ----------------------------------------------------------
echo ""
read -p "Create GitHub labels for the NeoBoard project? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Creating labels..."

    create_label() {
        gh label create "$1" --color "$2" --description "$3" --force 2>/dev/null && \
            log "Label: $1" || warn "Failed: $1"
    }

    # Type
    create_label "bug"              "d73a4a" "Something isn't working"
    create_label "enhancement"      "a2eeef" "New feature or request"
    create_label "security"         "e11d48" "Security-related issue"
    create_label "documentation"    "0075ca" "Documentation improvement"
    create_label "breaking-change"  "b60205" "Changes that break existing API"
    create_label "performance"      "f9d0c4" "Performance improvement"
    create_label "urgent"           "d93f0b" "Requires immediate attention"
    create_label "blocked"          "7057ff" "Blocked by external dependency"
    create_label "good-first-issue" "7057ff" "Good for newcomers"
    create_label "enterprise"       "fef2c0" "Enterprise package feature"
    create_label "claude"           "c4e3ff" "Assigned to Claude bot"

    # Package
    create_label "pkg:app"          "1d76db" "Next.js application package"
    create_label "pkg:component"    "5319e7" "UI component library"
    create_label "pkg:connection"   "0e8a16" "Database connector library"

    # Area
    create_label "area:auth"        "c5def5" "Authentication & authorization"
    create_label "area:connectors"  "c5def5" "Database connectors"
    create_label "area:widgets"     "c5def5" "Widget system"
    create_label "area:charts"      "c5def5" "Chart rendering"
    create_label "area:query-exec"  "c5def5" "Query execution & safety"
    create_label "area:dashboard"   "c5def5" "Dashboard management"
    create_label "area:api"         "c5def5" "API routes"

    log "Labels created"
else
    log "Skipped label creation"
fi

# ----------------------------------------------------------
# 6. OAuth Token for GitHub Actions
# ----------------------------------------------------------
echo ""
read -p "Set up OAuth token for GitHub Actions (uses your Pro plan)? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Generating OAuth token..."
    echo "  Run this command and follow the prompts:"
    echo ""
    echo "    claude setup-token"
    echo ""
    echo "  Then add the token as a GitHub secret:"
    echo ""
    echo "    gh secret set CLAUDE_CODE_OAUTH_TOKEN"
    echo ""
    echo "  (paste the token when prompted)"
    echo ""

    read -p "  Have you completed these steps? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "OAuth setup complete"
    else
        warn "Remember to complete OAuth setup before using @claude on GitHub"
    fi
else
    log "Skipped OAuth setup"
fi

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Setup Complete                         ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Local (Claude Code in terminal):"
echo ""
echo "    Autopilot:"
echo "      /next             — Pick next issue, implement, test, commit, PR"
echo "      /next 42          — Same but for a specific issue"
echo ""
echo "    Planning (Opus — use sparingly on Pro):"
echo "      /release-plan     — Spec → milestones → issues (one-time)"
echo "      /prioritize       — Rank all open issues"
echo "      /plan <feature>   — Architecture plan for complex features"
echo ""
echo "    Manual:"
echo "      /code 42          — Implement issue #42"
echo "      /components       — Build UI from existing component library"
echo "      /commit           — Conventional commit (Haiku)"
echo "      /pr               — Create labeled PR"
echo "      /review           — Security/quality review"
echo ""
echo "  GitHub (@claude mentions):"
echo "    @claude in any issue/PR comment"
echo "    Assign 'claude-bot' to an issue"
echo "    Add 'claude' label to an issue"
echo ""
echo "  MCPs (in Claude Code, run /mcp to verify):"
echo "    shadcn    — shadcn/ui components"
echo "    context7  — Up-to-date library docs"
if [ -f ".mcp.json" ] && grep -q '"github"' .mcp.json 2>/dev/null; then
echo "    github    — Issues, PRs, code review"
echo "    magic-ui  — Animated React+Tailwind components"
fi
echo ""
echo "  Pro plan tips:"
echo "    - /status to check remaining tokens"
echo "    - /compact between tasks"
echo "    - Opus (/plan, /prioritize) = 1-2× per week"
echo "    - /commit and /issue are nearly free (Haiku)"
echo ""