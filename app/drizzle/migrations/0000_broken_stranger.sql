DO $$
BEGIN
  PERFORM pg_advisory_lock(20260000);

  -- Create enums (ignore if already exist)
  BEGIN
    CREATE TYPE "public"."connection_type" AS ENUM('neo4j', 'postgresql');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE TYPE "public"."share_role" AS ENUM('viewer', 'editor');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Create tables
  CREATE TABLE IF NOT EXISTS "account" (
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "providerAccountId" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text
  );

  CREATE TABLE IF NOT EXISTS "connection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "name" text NOT NULL,
    "type" "connection_type" NOT NULL,
    "configEncrypted" text NOT NULL,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS "dashboard_share" (
    "id" text PRIMARY KEY NOT NULL,
    "dashboardId" text NOT NULL,
    "userId" text NOT NULL,
    "role" "share_role" NOT NULL,
    "createdAt" timestamp DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS "dashboard" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "layoutJson" jsonb DEFAULT '{"widgets":[],"gridLayout":[]}'::jsonb,
    "isPublic" boolean DEFAULT false,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS "session" (
    "sessionToken" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "expires" timestamp NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text,
    "email" text,
    "emailVerified" timestamp,
    "image" text,
    "passwordHash" text,
    "createdAt" timestamp DEFAULT now(),
    CONSTRAINT "user_email_unique" UNIQUE("email")
  );

  CREATE TABLE IF NOT EXISTS "verificationToken" (
    "identifier" text NOT NULL,
    "token" text NOT NULL,
    "expires" timestamp NOT NULL
  );

  -- Add foreign keys (skip if already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'account_userId_user_id_fk' AND table_schema = 'public'
  ) THEN
    ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'connection_userId_user_id_fk' AND table_schema = 'public'
  ) THEN
    ALTER TABLE "connection" ADD CONSTRAINT "connection_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dashboard_share_dashboardId_dashboard_id_fk' AND table_schema = 'public'
  ) THEN
    ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_dashboardId_dashboard_id_fk"
      FOREIGN KEY ("dashboardId") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dashboard_share_userId_user_id_fk' AND table_schema = 'public'
  ) THEN
    ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dashboard_userId_user_id_fk' AND table_schema = 'public'
  ) THEN
    ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'session_userId_user_id_fk' AND table_schema = 'public'
  ) THEN
    ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  PERFORM pg_advisory_unlock(20260000);
END $$;
