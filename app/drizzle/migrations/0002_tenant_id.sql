ALTER TABLE "dashboard" ADD COLUMN "tenant_id" text NOT NULL DEFAULT 'default';
ALTER TABLE "dashboard_share" ADD COLUMN "tenant_id" text NOT NULL DEFAULT 'default';
