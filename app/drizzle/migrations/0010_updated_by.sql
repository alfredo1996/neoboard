DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboard' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE "dashboard" ADD COLUMN "updated_by" text REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;
END $$;
