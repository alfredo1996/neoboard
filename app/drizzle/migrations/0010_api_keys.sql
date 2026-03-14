DO $$
BEGIN
  PERFORM pg_advisory_lock(20260010);
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'api_key' AND table_schema = 'public'
  ) THEN
    CREATE TABLE "api_key" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "tenant_id" text NOT NULL DEFAULT 'default',
      "key_hash" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "last_used_at" timestamp,
      "expires_at" timestamp,
      "created_at" timestamp DEFAULT now()
    );
    CREATE INDEX "api_key_user_id_idx" ON "api_key" ("userId");
  END IF;
  PERFORM pg_advisory_unlock(20260010);
END $$;
