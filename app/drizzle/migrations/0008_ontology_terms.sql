-- What a creator says about a connection's terms (#2415). Idempotent.
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
ALTER TABLE "ontology_term" DROP CONSTRAINT IF EXISTS "ontology_term_connection_id_connection_id_fk";
--> statement-breakpoint
ALTER TABLE "ontology_term" ADD CONSTRAINT "ontology_term_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE cascade ON UPDATE no action;
