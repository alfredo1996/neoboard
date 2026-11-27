-- Tags on dashboards (#1692). Idempotent.
ALTER TABLE "dashboard" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}' NOT NULL;
