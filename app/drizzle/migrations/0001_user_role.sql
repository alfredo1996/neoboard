DO $$
BEGIN
  PERFORM pg_advisory_lock(20260001);

  BEGIN
    CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator', 'reader');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user' AND column_name = 'role'
  ) THEN
    ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'creator' NOT NULL;
  END IF;

  PERFORM pg_advisory_unlock(20260001);
END $$;
