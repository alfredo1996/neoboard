-- A widget template needs no connector when its widget needs no connection
-- (markdown, iframe) — #1900. Such templates were stored against a hardcoded
-- connector type purely so the save dialog would open, which meant they were
-- only ever offered back on connections of that one type.
--
-- Idempotent as written: DROP NOT NULL on an already-nullable column is a
-- no-op in Postgres, not an error, so a re-run is safe.
ALTER TABLE "widget_template" ALTER COLUMN "connectorType" DROP NOT NULL;
