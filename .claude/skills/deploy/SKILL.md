---
name: deploy
description: Production-deployment audit — fresh stand-up, secrets, backup/restore, migrations, observability. Capture gaps as GitHub issues; do NOT fix in place.
model: sonnet
user-invokable: true
allowed-tools: Read, Write, Bash(docker *), Bash(docker-compose *), Bash(npm *), Bash(npx *), Bash(curl *), Bash(gh *), Bash(git *), Bash(cat *), Bash(ls *), Bash(find *), Bash(grep *), Bash(head *), Bash(tail *), Bash(jq *), Bash(node *), Bash(openssl *), Bash(psql *), Bash(pg_dump *), Bash(pg_isready *), Bash(sleep *), Bash(echo *), Bash(mkdir *), Bash(cp *), Bash(mv *), Bash(rm *)
---

# Deploy — Production Readiness Audit

**Goal**: someone clones the repo, follows the docs, deploys to production, and doesn't lose data or get pwned.

**Operating principle**: this skill is a **read-and-record** audit. Don't fix in place. File every gap as a GitHub issue on `alfredo1996/neoboard` with concrete repro steps and proposed fix. Fixes happen in their own PRs per the [one-PR-per-issue rule](../../../.claude/projects/-Users-alfredorubin-Desktop-public/memory/feedback_pr_per_issue.md).

If $ARGUMENTS contains an umbrella issue number (e.g. `/deploy 895`), link every filed issue to that umbrella in the body and as a comment.

## Destructive-step approval gate (MANDATORY)

This skill includes operations that destroy or rewrite real state: container/volume teardown, DB restore drills, secret rotation, migration runs. **Before running ANY command tagged `⚠️ DESTRUCTIVE` below, you MUST**:

1. Stop and use `AskUserQuestion` to confirm with the user. Show them the exact command, what it will destroy, and what state it leaves the system in if you abort.
2. If the user declines, **skip the entire sub-section** that command belongs to and add a note to the final report ("Section X.Y not exercised — user declined destructive step.")
3. Never chain destructive steps without re-asking between them.

Read-only inspection (`docker ps`, `cat`, `grep`, `curl`, `gh issue create`) does NOT require approval — only the gated ⚠️ commands.

## Pre-conditions

- Clean Docker state (stop + rm all containers — memory rule "destroy Docker before E2E" applies; same here for a true cold start)
- A scratch directory outside the repo for backup/restore drills (e.g. `/tmp/neoboard-deploy-audit-<date>/`)
- Network access to the repo and to docker hub

## Phase 1 — Cold-start audit (~30 min)

Verify the prod compose stack actually starts from zero.

⚠️ **DESTRUCTIVE — requires approval gate before running**. This tears down every container and volume on the machine.

```bash
# Confirm with user FIRST. Then:
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker volume ls -q | xargs -r docker volume rm 2>/dev/null || true
```

Read-only inspection (always safe):

```bash
# Inspect the prod compose files (two exist: prod.yml + prod-full.yml)
ls docker/docker-compose.prod*.yml
cat docker/docker-compose.prod.yml
cat docker/docker-compose.prod-full.yml
```

**Capture as issues**:

- Required env vars that the compose file expects but `app/.env.example` doesn't list
- Services with no healthchecks
- Services missing resource limits (CPU/memory)
- Volumes without explicit backup paths documented
- Hard-coded `localhost` / dev-only values in a "prod" file
- Image tags pinned to `:latest` (should be specific version)

⚠️ **DESTRUCTIVE — requires approval gate before running**. This starts a real prod stack; subsequent steps depend on it.

```bash
# Confirm with user FIRST. Then:
# Try to stand up using ONLY the documented procedure (no shortcuts)
# Start from docs/src/content/docs/getting-started/ — whatever the docs say to do
# If docs are missing, that itself is a finding.

cd docker
docker compose -f docker-compose.prod.yml --env-file ../app/.env.local.audit up -d
sleep 30
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 50 app  # or whatever the app service is named
```

**Capture as issues**:

- Stack fails to start with a fresh `.env`
- App starts but immediately errors (DB connection, missing migrations, etc.)
- "ready" signal is silent (per [feedback_cli_ready_signal](../../../.claude/projects/-Users-alfredorubin-Desktop-public/memory/feedback_cli_ready_signal.md))
- Healthcheck endpoint doesn't return 200 within reasonable time
- Log noise (warnings, missing-env spam)

## Phase 2 — Deployment checklist walk-through (~20 min)

Walk every checkbox in `docs/src/content/docs/administration/deployment-checklist.mdx` against current code reality.

```bash
cat docs/src/content/docs/administration/deployment-checklist.mdx
```

For every checkbox, verify the **code actually requires what the docs say**:

- For each env var listed: is it actually read by the code? (`grep -rn "process.env.VAR_NAME" app/src`)
- For each "required" var: is it enforced at startup? (check `app/src/lib/env-config.ts`)
- For each "recommended" infra setting: does the code actually use it?

**Capture as issues**:

- Env vars listed in checklist but never referenced in code (stale doc)
- Env vars required by code but missing from checklist (incomplete doc)
- "Required" vars marked as optional in code's env-config (mismatch — see #907)
- Resource limits / network policies the docs prescribe but code never validates

## Phase 3 — Operational drills (~45 min)

The procedures in admin docs must actually work. Run them.

### 3a. Secret rotation

⚠️ **DESTRUCTIVE — requires approval gate**. Rotating `ENCRYPTION_KEY` against a live DB rewrites encrypted credentials. If the rotation procedure is broken, ALL stored connection credentials can become unrecoverable. Do this against a scratch DB created specifically for the drill, not anything you care about.

```bash
# Confirm with user FIRST, including which DB this targets. Then:
# Rotate ENCRYPTION_KEY following docs/src/content/docs/administration/*
# Verify: existing encrypted credentials decrypt with the old key, re-encrypt with new
# Verify: docs warn that mid-flight rotation requires a re-encryption step
```

**Capture as issues**:

- Docs don't have a rotation procedure for a given secret
- Procedure exists but fails when followed
- Rotation invalidates user-facing state silently (e.g. all API keys die without warning — see #907 acceptance criteria)

### 3b. Backup / restore

Read-only first:

```bash
cat docs/src/content/docs/administration/backup-restore.mdx
```

⚠️ **DESTRUCTIVE — requires approval gate**. `down -v` destroys the DB volume. If the drill is run against the wrong stack, real data is lost. Run only against the audit-scratch stack, never a live one.

```bash
# Confirm with user FIRST, showing which compose file and which volume. Then:
# Drill: take a backup, destroy the DB, restore, verify nothing lost
pg_dump -h localhost -U neoboard neoboard > /tmp/neoboard-deploy-audit/backup.sql
docker compose -f docker/docker-compose.prod.yml down -v   # destroys DB volume
docker compose -f docker/docker-compose.prod.yml up -d postgres
sleep 10
psql -h localhost -U neoboard -d neoboard < /tmp/neoboard-deploy-audit/backup.sql
# Verify: bring app back up, log in, dashboards present, connections present
```

**Capture as issues**:

- Backup procedure missing a step (e.g. doesn't capture migration version table)
- Restore fails on a fresh DB (e.g. extension dependencies, FK ordering)
- Encrypted credential blob doesn't round-trip (lost ENCRYPTION_KEY ↔ new install)
- No documented retention/rotation strategy

### 3c. Migration upgrade path

Read-only first:

```bash
# Check forward-only enforcement
cat app/src/lib/db/migrate.ts | head -60
ls app/src/lib/db/migrations/
```

⚠️ **DESTRUCTIVE — requires approval gate**. Running migrations against a DB modifies schema. Use the audit-scratch DB, not anything you care about.

```bash
# Confirm with user FIRST. Then:
# Drill: start with an older migration set, run npm run db:migrate, verify advisory lock + idempotency
```

**Capture as issues**:

- Migration runner missing the advisory lock (memory rule: "Advisory lock prevents concurrent runs")
- `MIGRATE_ON_START` boot-migration opt-out (`MIGRATE_ON_START=0`) missing or undocumented
- No version-skip test path (can a v0.5 → v1.1 install succeed?)
- Rollback story undocumented (forward-only is fine, but operators need to know that)

## Phase 4 — Observability (~15 min)

Verify operators can actually monitor a deployed instance.

```bash
# Health endpoint
curl -s http://localhost:3000/api/health | jq
cat app/src/app/api/health/route.ts

# Logs — what does production output look like?
docker logs <app-container> --tail 100
# Is there structured JSON? Levels? Request IDs?

# Monitoring doc
cat docs/src/content/docs/administration/monitoring.mdx
```

**Capture as issues**:

- `/api/health` returns 200 even when DB is down (false healthy)
- Health response doesn't include version / migration status / connector status
- Logs are unstructured / lack request IDs
- monitoring.mdx references metrics/dashboards that don't exist
- No `/metrics` endpoint (Prometheus expectation)
- No example Grafana dashboard / Datadog template / etc.

## Phase 5 — TLS / reverse proxy / multi-tenancy (~15 min)

```bash
# What does the app expect from the reverse proxy?
grep -rn "X-Forwarded-Proto\|X-Forwarded-For\|trustProxy\|FORCE_HTTPS" app/src

# SaaS vs on-prem — memory rule: env vars only, never code branches
grep -rnE "process\.env\.(SAAS|ON_PREM|DEPLOYMENT_MODE)" app/src
```

**Capture as issues**:

- `FORCE_HTTPS` documented but not actually wired up
- No example reverse-proxy configs (nginx/Caddy/Traefik) in docs
- Code branches on deployment mode (violates memory rule)
- Tenant isolation not verifiable end-to-end (per Phase 7 of the polish plan — query safety)

## Phase 6 — Compile findings

Output a numbered list:

```
## Deployment audit findings (YYYY-MM-DD)

### Phase 1 — Cold start
- [ ] #NNN — <title>
...

### Phase 2 — Checklist
...

### Phase 3 — Drills
...

### Phase 4 — Observability
...

### Phase 5 — TLS/proxy/multi-tenancy
...
```

File each as a GH issue using the [issue skill](../issue/skill.md):

- Labels: type + `pkg:app` + `area:devex` or `area:release` + (often) `documentation`
- Title prefix `[P0]` for ship blockers (stack won't start, data loss possible), `[P1]` for serious correctness gaps, `[P2]` for QoL / completeness
- Body must include exact repro from the audit + proposed fix shape
- Link to the umbrella issue passed in $ARGUMENTS if any

## Post-audit

- Print the count: "Audit complete: N issues filed across 5 phases. M P0, X P1, Y P2."
- Append a summary comment to the umbrella issue
- Do NOT proceed to fixes in this skill — fixes happen in their own PRs

## When NOT to use this skill

- Mid-development; not a code-correctness audit (use `code-reviewer` + `harden`)
- For a single feature deploy story (this is whole-system)
- When the prod compose is known broken (fix first, audit second)
