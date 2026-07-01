CREATE TYPE "public"."connection_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."share_role" AS ENUM('viewer', 'editor');--> statement-breakpoint
CREATE TYPE "public"."sso_protocol" AS ENUM('oidc');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator', 'reader');--> statement-breakpoint
CREATE TABLE "account" (
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
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text,
	"name" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"configEncrypted" text NOT NULL,
	"allow_per_card_db" boolean DEFAULT true NOT NULL,
	"visibility" "connection_visibility" DEFAULT 'private' NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dashboard_share" (
	"id" text PRIMARY KEY NOT NULL,
	"dashboardId" text NOT NULL,
	"userId" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"role" "share_role" NOT NULL,
	"createdAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dashboard" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"layoutJson" jsonb DEFAULT '{"version":2,"pages":[{"id":"page-1","title":"Page 1","widgets":[],"gridLayout":[]}]}'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"isPublic" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"protocol" "sso_protocol" DEFAULT 'oidc' NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_encrypted" text NOT NULL,
	"scopes" text DEFAULT 'openid profile email' NOT NULL,
	"claim_mappings" jsonb,
	"auto_provision" boolean DEFAULT true NOT NULL,
	"default_role" "user_role" DEFAULT 'creator' NOT NULL,
	"enforce_sso" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "sso_provider_tenant_issuer_unique" UNIQUE("tenant_id","issuer")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"passwordHash" text,
	"role" "user_role" DEFAULT 'creator' NOT NULL,
	"can_write" boolean DEFAULT true NOT NULL,
	"force_password_change" boolean DEFAULT false NOT NULL,
	"passwordChangedAt" timestamp,
	"disabledAt" timestamp,
	"lastLoginAt" timestamp,
	"createdAt" timestamp DEFAULT now(),
	"tenant_id" text DEFAULT 'default' NOT NULL,
	CONSTRAINT "user_email_tenant_unique" UNIQUE("email","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}',
	"chartType" text NOT NULL,
	"connectorType" text NOT NULL,
	"connectionId" text,
	"query" text DEFAULT '' NOT NULL,
	"params" jsonb,
	"settings" jsonb,
	"previewImageUrl" text,
	"createdBy" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_dashboardId_dashboard_id_fk" FOREIGN KEY ("dashboardId") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_template" ADD CONSTRAINT "widget_template_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;