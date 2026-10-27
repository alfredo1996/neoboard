-- Secret-free address shown on the Connections list (#2265). Idempotent.
ALTER TABLE "connection" ADD COLUMN IF NOT EXISTS "display_address" text;
