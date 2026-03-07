DO $$
BEGIN
  PERFORM pg_advisory_lock(20260004);
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'widget_template'
  ) THEN
    CREATE TABLE "widget_template" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "tags" text[] DEFAULT '{}',
      "chartType" text NOT NULL,
      "connectorType" text NOT NULL,
      "query" text NOT NULL DEFAULT '',
      "params" jsonb,
      "settings" jsonb,
      "createdBy" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "tenant_id" text NOT NULL DEFAULT 'default',
      "createdAt" timestamp DEFAULT now(),
      "updatedAt" timestamp DEFAULT now()
    );
  END IF;
  PERFORM pg_advisory_unlock(20260004);
END $$;
