-- Ontology correctness (#2534). Idempotent.
-- The unique connection_tenant_id_unique carries the same (tenant_id, id) index.
DROP INDEX IF EXISTS "connection_tenant_id_idx";
--> statement-breakpoint
-- A connection delete cascades to its sides by (tenant_id, connection_id); the
-- unique on the side leads with concept_id, so without this it scans the table.
CREATE INDEX IF NOT EXISTS "ontology_concept_side_tenant_connection_idx" ON "ontology_concept_side" USING btree ("tenant_id","connection_id");
--> statement-breakpoint
-- A concept with no sides binds nothing but keeps its name and parameter
-- reserved while nobody can see it. It goes when its last side does, whichever
-- way the side went (a connection or user delete cascades here, so no route
-- sees it). Deferred to commit, so a save that deletes the sides and inserts
-- new ones in one transaction keeps the concept.
-- The concept is locked first and the sides re-checked in a separate
-- statement: under READ COMMITTED each statement takes a fresh snapshot, so a
-- side a concurrent writer committed while we waited for the lock is seen and
-- the concept stays.
CREATE OR REPLACE FUNCTION ontology_concept_drop_orphan() RETURNS trigger AS $$
BEGIN
	PERFORM 1 FROM "ontology_concept"
		WHERE "tenant_id" = OLD."tenant_id" AND "id" = OLD."concept_id" FOR UPDATE;
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
