# Idempotent Database Migrations Plan

## Summary

Drizzle-generated SQL migrations fail when run against an already-populated database because they use non-idempotent DDL (`CREATE TABLE`, `CREATE TYPE`, `ALTER TABLE ADD COLUMN`) without existence guards. The project's `CLAUDE.md` and `PROJECT.md` state that migrations must be idempotent, and several later migrations (0003-0006) already use `DO $$ ... IF NOT EXISTS` blocks. However, the earliest migrations (0000, 0001, 0002) and the newest (0007) use bare DDL that crashes on re-run.

**Root cause:** `drizzle-kit generate` produces plain DDL. Drizzle ORM's runtime migrator (`drizzle-orm/pg-core/dialect.js`) tracks applied migrations in `drizzle.__drizzle_migrations` by timestamp. If that tracking table exists and the migration was recorded, it is skipped. Failures happen when:

1. The tracking table is absent but the schema objects already exist (e.g., DB seeded by `init-test.sql` or `init.sql` without the tracking table).
2. A migration partially applied (e.g., one statement succeeded, next failed) and is retried.
3. The `__drizzle_migrations` row was lost or the schema was manually created.

**Proposed solution:** Rewrite all migration SQL files to be idempotent using PostgreSQL's `IF NOT EXISTS` / `IF EXISTS` / `DO $$` guards, and establish a convention + CI lint for future migrations.

---

## Architecture Decision

### Option A: Rewrite migration SQL to be idempotent (CHOSEN)

Each `.sql` migration file is rewritten so every statement is safe to re-execute:
- `CREATE TABLE` -> `CREATE TABLE IF NOT EXISTS`
- `CREATE TYPE` -> wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`
- `ALTER TABLE ADD COLUMN` -> wrapped in `DO $$ IF NOT EXISTS (SELECT ... FROM information_schema.columns ...) THEN ... END IF $$`
- `ALTER TABLE ADD CONSTRAINT` -> wrapped in `DO $$ IF NOT EXISTS (SELECT ... FROM information_schema.table_constraints ...) THEN ... END IF $$`

**Pros:** Matches the pattern already used in migrations 0003-0006. No runtime changes needed. Works regardless of whether the tracking table is present. Safe for version-skip upgrades.

**Cons:** Drizzle-generated SQL must be manually edited after each `drizzle-kit generate`. This is already the case (see 0003-0006), so no new process burden.

### Option B: Custom migration runner wrapper (REJECTED)

Write a custom `runMigrations()` function that wraps each migration in try/catch logic or pre-checks the `__drizzle_migrations` table before running.

**Rejected because:** The Drizzle migrator already skips recorded migrations. The problem is not the runner but the SQL itself. If the tracking table is out of sync with the actual schema, the runner cannot help. Idempotent SQL is the only reliable solution.

### Option C: Always drop and recreate (REJECTED)

Use `DROP ... CASCADE` before `CREATE`.

**Rejected because:** This destroys production data.

---

## Affected Packages

| Package | Impact |
|---------|--------|
| `app/` | Migration SQL files rewritten; no TypeScript changes; CI lint added |
| `component/` | None |
| `connection/` | None |

---

## Root Cause Analysis: Per-Migration Audit

### Migration 0000 (`0000_broken_stranger.sql`) -- NOT IDEMPOTENT

Non-idempotent statements:
- `CREATE TYPE "public"."connection_type" AS ENUM(...)` -- fails if type exists
- `CREATE TYPE "public"."share_role" AS ENUM(...)` -- fails if type exists
- `CREATE TABLE "account" (...)` -- fails if table exists (no IF NOT EXISTS)
- `CREATE TABLE "connection" (...)` -- fails if table exists
- `CREATE TABLE "dashboard_share" (...)` -- fails if table exists
- `CREATE TABLE "dashboard" (...)` -- fails if table exists
- `CREATE TABLE "session" (...)` -- fails if table exists
- `CREATE TABLE "user" (...)` -- fails if table exists
- `CREATE TABLE "verificationToken" (...)` -- fails if table exists
- `ALTER TABLE ... ADD CONSTRAINT` (6 statements) -- fails if constraint exists

### Migration 0001 (`0001_user_role.sql`) -- NOT IDEMPOTENT

- `CREATE TYPE "public"."user_role" AS ENUM(...)` -- fails if type exists
- `ALTER TABLE "user" ADD COLUMN "role"` -- fails if column exists

### Migration 0002 (`0002_tenant_id.sql`) -- NOT IDEMPOTENT

- `ALTER TABLE "dashboard" ADD COLUMN "tenant_id"` -- fails if column exists
- `ALTER TABLE "dashboard_share" ADD COLUMN "tenant_id"` -- fails if column exists

### Migration 0003 (`0003_stormy_apocalypse.sql`) -- IDEMPOTENT (already guarded)

Uses `DO $$ ... IF ... IS DISTINCT FROM ... THEN ALTER TABLE ... END IF $$ $$`

### Migration 0004 (`0004_can_write.sql`) -- IDEMPOTENT (already guarded)

Uses `DO $$ ... IF NOT EXISTS ... THEN ALTER TABLE ... END IF $$`

### Migration 0005 (`0005_widget_template.sql`) -- IDEMPOTENT (already guarded)

Uses `DO $$ ... IF NOT EXISTS ... THEN CREATE TABLE ... END IF $$`

### Migration 0006 (`0006_preview_image_url.sql`) -- IDEMPOTENT (already guarded)

Uses `DO $$ ... IF NOT EXISTS ... THEN ALTER TABLE ... ADD COLUMN ... END IF $$`

### Migration 0007 (`0007_keen_the_captain.sql`) -- NOT IDEMPOTENT

- `ALTER TABLE "user" ADD COLUMN "can_write" boolean DEFAULT true NOT NULL` -- fails if column exists (duplicate of 0004 which already added this column idempotently)

**Critical issue:** Migration 0007 is a duplicate of 0004. Running both will always fail on the second one. This appears to be an accidental re-generation by `drizzle-kit`. The 0007 migration should either be deleted or made into a no-op.

---

## Ordered Tasks

### Task 1: Rewrite migration 0000 to be idempotent (M)

Rewrite `0000_broken_stranger.sql` to use:
- `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` for enums
- `CREATE TABLE IF NOT EXISTS` for all tables
- `DO $$ IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = '...') THEN ALTER TABLE ... ADD CONSTRAINT ... END IF $$` for foreign keys

### Task 2: Rewrite migration 0001 to be idempotent (S)

- Wrap `CREATE TYPE "public"."user_role"` in a `DO $$ ... EXCEPTION WHEN duplicate_object` block
- Wrap `ALTER TABLE ... ADD COLUMN "role"` in `DO $$ IF NOT EXISTS (SELECT ... information_schema.columns ...) THEN ... END IF $$`

### Task 3: Rewrite migration 0002 to be idempotent (S)

- Wrap both `ALTER TABLE ... ADD COLUMN "tenant_id"` statements in `DO $$ IF NOT EXISTS ... $$` blocks

### Task 4: Fix migration 0007 (S)

Migration 0007 duplicates what 0004 already does (adds `can_write` column). Options:
- **Option A (recommended):** Replace the content with an idempotent guard, same pattern as 0004. If the column already exists, it is a no-op.
- **Option B:** Delete the migration file and remove its journal entry. This is riskier because some databases may have already recorded 0007 in `__drizzle_migrations`.

Recommended: wrap in `DO $$ IF NOT EXISTS ... $$` so it is safe regardless of prior state.

### Task 5: Add advisory locks to migrations 0000-0002 (S)

Migrations 0003-0006 use `pg_advisory_lock(...)` to prevent concurrent runs. Add the same pattern to 0000-0002 for consistency. Use distinct lock IDs:
- 0000: `pg_advisory_lock(20260000)`
- 0001: `pg_advisory_lock(20260001)` (note: 0003 already uses this ID, so use `20260010` for 0001)
- 0002: `pg_advisory_lock(20260002)`

### Task 6: Update `_journal.json` snapshot hashes (S)

Drizzle tracks migration hashes in `__drizzle_migrations`. After rewriting SQL files, the hashes will differ. Two strategies:

**Strategy A (for fresh installs):** Accept the new hashes. The migrator compares `created_at` timestamps, not hashes. As long as the timestamps in `_journal.json` are unchanged, the migrator will correctly skip already-applied migrations and run pending ones.

**Strategy B (for existing installs with recorded hashes):** No action needed. Drizzle's migrator skips migrations whose `folderMillis` timestamp is <= the last recorded `created_at`. It does NOT compare hashes at runtime (confirmed by reading the source: `dialect.js` line 62 only checks `created_at`).

The snapshot JSON files (`meta/000N_snapshot.json`) do NOT need updating -- they are only used by `drizzle-kit` for diff generation, not by the runtime migrator.

### Task 7: Establish convention + CI lint for future migrations (S)

- Add a section to `CLAUDE.md` and/or `claude_code_docs/TESTING_APPROACH.md` documenting the idempotent migration pattern.
- Add a simple CI check (shell script or Node.js) that scans `app/drizzle/migrations/*.sql` for bare `CREATE TABLE` (without `IF NOT EXISTS`), bare `CREATE TYPE`, and bare `ALTER TABLE ... ADD COLUMN` (without a `DO $$` wrapper). Fail the build if found.

### Task 8: Integration test for idempotent migrations (M)

Add a test (can be a simple script or a Vitest test) that:
1. Starts a fresh PostgreSQL container
2. Runs all migrations via `drizzle-kit migrate`
3. Runs all migrations again
4. Asserts no errors on the second run

This validates the full migration suite is truly idempotent.

---

## Migration Needed?

**No new migration.** This plan rewrites existing migration SQL files in-place. The `_journal.json` entries and snapshot files remain as-is.

---

## Security Checklist

- [x] No credential changes
- [x] No new tables or columns
- [x] Advisory locks prevent concurrent migration execution
- [x] No data destruction -- all changes are additive guards (`IF NOT EXISTS`)
- [x] No changes to tenant isolation or query safety

---

## Testing Strategy

| Layer | What | Tool |
|-------|------|------|
| Integration | Run migrations twice on fresh DB, verify no errors | Script + testcontainers |
| Integration | Run migrations on pre-seeded DB (simulating `init-test.sql`), verify no errors | Script + testcontainers |
| CI | Lint all `.sql` files for non-idempotent DDL patterns | Shell script |
| E2E | Existing E2E suite continues to pass (migrations run during `global-setup.ts`) | Playwright |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rewritten SQL changes migration hash, causing Drizzle to re-run already-applied migration | Low | Medium | Drizzle runtime only checks `created_at` timestamp, not hash (verified in source). Idempotent SQL means re-running is harmless. |
| `init-test.sql` creates tables before migrations run, causing migration to attempt re-creation | Already happening | High | Idempotent migrations solve this entirely. Alternatively, E2E could run `drizzle-kit migrate` instead of using `init-test.sql`. |
| Migration 0007 is a duplicate of 0004; databases that ran both have inconsistent state | Medium | Low | Making 0007 idempotent means it silently no-ops on databases where 0004 already ran. |
| Future developers forget to make migrations idempotent | Medium | Medium | CI lint (Task 7) catches non-idempotent patterns before merge. |
| Advisory lock IDs collide across migrations | Low | Low | Use migration number as part of lock ID (e.g., `20260000` for migration 0000). Document the convention. |

---

## Suggested GitHub Issues

### Issue: Make all database migrations idempotent
**Labels:** `chore`, `app`, `database`
**Milestone:** v0.5

Database migrations 0000, 0001, 0002, and 0007 use bare DDL that fails when re-run against an already-populated database. This violates the project's stated requirement that migrations be idempotent.

**Acceptance criteria:**
1. All 8 migration files (0000-0007) use idempotent SQL patterns (`IF NOT EXISTS`, `DO $$ EXCEPTION WHEN duplicate_object`, etc.)
2. Running `drizzle-kit migrate` twice on a fresh database produces no errors
3. Running `drizzle-kit migrate` on a database pre-seeded with `init-test.sql` produces no errors
4. CI lint rejects PRs that add non-idempotent migration SQL
5. Migration 0007 (duplicate `can_write` column) is resolved

Tasks: 1-8

---

## Appendix: Idempotent SQL Patterns Reference

### CREATE TYPE (enum)
```sql
DO $$ BEGIN
  CREATE TYPE "public"."connection_type" AS ENUM('neo4j', 'postgresql');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### CREATE TABLE
```sql
CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    ...
);
```

### ALTER TABLE ADD COLUMN
```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'role'
  ) THEN
    ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'creator' NOT NULL;
  END IF;
END $$;
```

### ALTER TABLE ADD CONSTRAINT (foreign key)
```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'account_userId_user_id_fk'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
```

### ALTER TABLE ALTER COLUMN SET DEFAULT
```sql
DO $$ BEGIN
  IF (
    SELECT column_default FROM information_schema.columns
    WHERE table_name = 'dashboard' AND column_name = 'layoutJson'
  ) IS DISTINCT FROM '<new_default>'::text THEN
    ALTER TABLE "dashboard" ALTER COLUMN "layoutJson" SET DEFAULT '<new_default>'::jsonb;
  END IF;
END $$;
```
