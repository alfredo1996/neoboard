-- Concepts: one thing linked across connections by a key (#2484). Idempotent.
-- Statement order checked by hand (#1646): both tables, with the UNIQUE
-- (tenant_id, id) the side's composite FK references, come before the FKs.
CREATE TABLE IF NOT EXISTS "ontology_concept" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"parameter" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "ontology_concept_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "ontology_concept_tenant_name_unique" UNIQUE("tenant_id","name"),
	CONSTRAINT "ontology_concept_tenant_parameter_unique" UNIQUE("tenant_id","parameter")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ontology_concept_side" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"concept_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"entity_key" text NOT NULL,
	"key_property_key" text NOT NULL,
	CONSTRAINT "ontology_concept_side_unique" UNIQUE("tenant_id","concept_id","connection_id","entity_key","key_property_key")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ontology_concept_side_tenant_concept_fk') THEN
		ALTER TABLE "ontology_concept_side" ADD CONSTRAINT "ontology_concept_side_tenant_concept_fk" FOREIGN KEY ("tenant_id","concept_id") REFERENCES "public"."ontology_concept"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ontology_concept_side_tenant_connection_fk') THEN
		ALTER TABLE "ontology_concept_side" ADD CONSTRAINT "ontology_concept_side_tenant_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."connection"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
