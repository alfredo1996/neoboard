DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboard' AND column_name = 'thumbnailJson'
  ) THEN
    ALTER TABLE "dashboard" ADD COLUMN "thumbnailJson" jsonb;
  END IF;
END $$;
