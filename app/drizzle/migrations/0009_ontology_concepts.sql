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
--> statement-breakpoint
-- A connection delete cascades to its sides by (tenant_id, connection_id); the
-- unique above leads with concept_id, so without this it scans the table (#2534).
CREATE INDEX IF NOT EXISTS "ontology_concept_side_tenant_connection_idx" ON "ontology_concept_side" USING btree ("tenant_id","connection_id");
--> statement-breakpoint
-- A concept with no sides binds nothing but keeps its name and parameter
-- reserved while nobody can see it (#2534). It goes when its last side does,
-- whichever way the side went (a connection or user delete cascades here, so
-- no route sees it). Deferred to commit, so a save that deletes the sides and
-- inserts new ones in one transaction keeps the concept.
CREATE OR REPLACE FUNCTION ontology_concept_drop_orphan() RETURNS trigger AS $$
BEGIN
	DELETE FROM "ontology_concept" c
	WHERE c."tenant_id" = OLD."tenant_id" AND c."id" = OLD."concept_id"
		AND NOT EXISTS (
			SELECT 1 FROM "ontology_concept_side" s
			WHERE s."tenant_id" = c."tenant_id" AND s."concept_id" = c."id"
		);
	RETURN NULL;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "ontology_concept_side_orphan" ON "ontology_concept_side";
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ontology_concept_side_orphan" AFTER DELETE ON "ontology_concept_side" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ontology_concept_drop_orphan();
--> statement-breakpoint
-- Concepts already sideless before this ran.
DELETE FROM "ontology_concept" c WHERE NOT EXISTS (SELECT 1 FROM "ontology_concept_side" s WHERE s."tenant_id" = c."tenant_id" AND s."concept_id" = c."id");
