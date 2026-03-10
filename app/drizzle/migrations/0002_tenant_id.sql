DO $$
BEGIN
  PERFORM pg_advisory_lock(20260002);

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboard' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE "dashboard" ADD COLUMN "tenant_id" text NOT NULL DEFAULT 'default';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboard_share' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE "dashboard_share" ADD COLUMN "tenant_id" text NOT NULL DEFAULT 'default';
  END IF;

  PERFORM pg_advisory_unlock(20260002);
END $$;
