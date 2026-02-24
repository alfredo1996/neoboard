DO $$
BEGIN
  PERFORM pg_advisory_lock(20260001);
  IF (
    SELECT column_default
    FROM information_schema.columns
    WHERE table_name = 'dashboard' AND column_name = 'layoutJson'
  ) IS DISTINCT FROM '{"version":2,"pages":[{"id":"page-1","title":"Page 1","widgets":[],"gridLayout":[]}]}'::text THEN
    ALTER TABLE "dashboard" ALTER COLUMN "layoutJson" SET DEFAULT '{"version":2,"pages":[{"id":"page-1","title":"Page 1","widgets":[],"gridLayout":[]}]}'::jsonb;
  END IF;
  PERFORM pg_advisory_unlock(20260001);
END $$;
