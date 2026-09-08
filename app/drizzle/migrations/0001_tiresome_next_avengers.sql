-- Statement order fixed by hand (#1646): drizzle-kit 0.31 emitted the composite
-- FOREIGN KEY constraints before the UNIQUE (tenant_id, id) constraints they
-- reference, which Postgres rejects (42830). Uniques now come first.
ALTER TABLE "api_key" DROP CONSTRAINT "api_key_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "connection" DROP CONSTRAINT "connection_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard_share" DROP CONSTRAINT "dashboard_share_dashboardId_dashboard_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard_share" DROP CONSTRAINT "dashboard_share_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard" DROP CONSTRAINT "dashboard_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "widget_template" DROP CONSTRAINT "widget_template_createdBy_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_tenant_id_unique" UNIQUE("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_unique" UNIQUE("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_tenant_user_fk" FOREIGN KEY ("tenant_id","userId") REFERENCES "public"."user"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_tenant_user_fk" FOREIGN KEY ("tenant_id","userId") REFERENCES "public"."user"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_tenant_dashboard_fk" FOREIGN KEY ("tenant_id","dashboardId") REFERENCES "public"."dashboard"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_tenant_user_fk" FOREIGN KEY ("tenant_id","userId") REFERENCES "public"."user"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_tenant_user_fk" FOREIGN KEY ("tenant_id","userId") REFERENCES "public"."user"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "widget_template" ADD CONSTRAINT "widget_template_tenant_created_by_fk" FOREIGN KEY ("tenant_id","createdBy") REFERENCES "public"."user"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "api_key_tenant_id_idx" ON "api_key" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "audit_log_tenant_created_idx" ON "audit_log" USING btree ("tenant_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "connection_tenant_id_idx" ON "connection" USING btree ("tenant_id","id");
--> statement-breakpoint
CREATE INDEX "dashboard_share_tenant_user_idx" ON "dashboard_share" USING btree ("tenant_id","userId");
--> statement-breakpoint
CREATE INDEX "widget_template_tenant_id_idx" ON "widget_template" USING btree ("tenant_id","id");
