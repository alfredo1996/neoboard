CREATE TYPE "public"."sso_protocol" AS ENUM('oidc');--> statement-breakpoint
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
