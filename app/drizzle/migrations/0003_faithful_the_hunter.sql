-- Emails are stored lowercased and trimmed (#2001). Before this, every write
-- path stored the address as typed and every lookup was an exact match, so
-- "Alice@x.com" could not sign in as "alice@x.com" and case variants of one
-- mailbox could coexist in a tenant.
--
-- The UPDATE is required, not optional: login now lowercases its input, so an
-- existing mixed-case row could no longer sign in. If two rows collide once
-- lowercased, it fails on user_email_tenant_unique: that pair needs a manual
-- merge, not a silent pick.
--
-- Idempotent as written: the UPDATE touches only rows not yet normalized, and
-- the check is dropped before it is re-added.
UPDATE "user" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_normalized";
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_normalized" CHECK ("user"."email" = lower(trim("user"."email")));
