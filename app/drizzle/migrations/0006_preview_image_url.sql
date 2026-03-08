DO $$
BEGIN
  PERFORM pg_advisory_lock(20260006);
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'widget_template' AND column_name = 'previewImageUrl'
  ) THEN
    ALTER TABLE "widget_template" ADD COLUMN "previewImageUrl" TEXT;
  END IF;
  PERFORM pg_advisory_unlock(20260006);
END $$;
