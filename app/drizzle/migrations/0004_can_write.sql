DO $$
BEGIN
  PERFORM pg_advisory_lock(20260004);
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user' AND column_name = 'can_write'
  ) THEN
    ALTER TABLE "user" ADD COLUMN "can_write" BOOLEAN NOT NULL DEFAULT true;
  END IF;
  PERFORM pg_advisory_unlock(20260004);
END $$;
