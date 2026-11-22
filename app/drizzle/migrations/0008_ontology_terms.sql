-- What a creator says about a connection's terms (#2415). Idempotent: a constraint is added only when it is missing, since the FKs
-- below depend on the unique and a DROP would fail on a second run (#2534).
-- Statement order fixed by hand (#1646): drizzle-kit emitted the composite
-- FOREIGN KEY before the UNIQUE (tenant_id, id) it references, which Postgres
-- rejects (42830). The unique comes first.
CREATE TABLE IF NOT EXISTS "ontology_term" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"connection_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"parent_key" text DEFAULT '' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ontology_term_tenant_connection_term_unique" UNIQUE("tenant_id","connection_id","kind","key","parent_key")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'connection_tenant_id_unique') THEN
		ALTER TABLE "connection" ADD CONSTRAINT "connection_tenant_id_unique" UNIQUE("tenant_id","id");
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ontology_term_tenant_connection_fk') THEN
		ALTER TABLE "ontology_term" ADD CONSTRAINT "ontology_term_tenant_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."connection"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
-- The unique above carries the same (tenant_id, id) index (#2534).
DROP INDEX IF EXISTS "connection_tenant_id_idx";
