DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'widget_template' AND column_name = 'connectionId'
  ) THEN
    ALTER TABLE "widget_template" ADD COLUMN "connectionId" text;
  END IF;
END $$;
