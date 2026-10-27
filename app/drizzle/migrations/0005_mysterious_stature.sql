-- One share per (tenant, dashboard, user) (#2259). The share POST checked for
-- a row and then inserted, so two requests in flight both inserted. Existing
-- duplicates are removed first, keeping the newest row of each key (latest
-- createdAt, id as the tie-break), then the key is added so Postgres refuses
-- the second row.
--
-- Idempotent as written: the lock holds writers off between the dedupe and the
-- constraint, the dedupe finds nothing on a re-run, and the constraint is
-- dropped before it is re-added.
LOCK TABLE "dashboard_share" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DELETE FROM "dashboard_share" s USING "dashboard_share" newer
 WHERE s."tenant_id" = newer."tenant_id"
   AND s."dashboardId" = newer."dashboardId"
   AND s."userId" = newer."userId"
   AND s."id" <> newer."id"
   AND (COALESCE(s."createdAt", 'epoch'), s."id") < (COALESCE(newer."createdAt", 'epoch'), newer."id");
--> statement-breakpoint
ALTER TABLE "dashboard_share" DROP CONSTRAINT IF EXISTS "dashboard_share_tenant_dashboard_user_unique";
--> statement-breakpoint
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_tenant_dashboard_user_unique" UNIQUE("tenant_id","dashboardId","userId");
