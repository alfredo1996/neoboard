-- Emails are stored lowercased and trimmed (#2001). Before this, every write
-- path stored the address as typed and every lookup was an exact match, so
-- "Alice@x.com" could not sign in as "alice@x.com" and case variants of one
-- mailbox could coexist in a tenant.
--
-- regexp_replace, not trim(): trim() strips only spaces, while the app's JS
-- trim() also strips tabs and line breaks, so a row ending in \r would survive
-- trim() and never match a login again.
--
-- The lock holds until the migrator commits (it runs every pending migration
-- in one transaction), so no row can be written between the check, the UPDATE
-- and the ADD below. Reads carry on.
--
-- Rows that collide once normalized stop the upgrade with a message naming
-- them: that pair needs a manual merge, not a silent pick.
--
-- Idempotent as written: the UPDATE touches only rows not yet normalized, and
-- the check is dropped before it is re-added.
LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE
  clashes text;
BEGIN
  SELECT string_agg(format('tenant %L: %s', tenant_id, emails), '; ')
    INTO clashes
    FROM (
      SELECT tenant_id, string_agg(quote_literal(email), ', ' ORDER BY email) AS emails
        FROM "user"
       GROUP BY tenant_id, lower(regexp_replace(email, '^\s+|\s+$', '', 'g'))
      HAVING count(*) > 1
    ) AS grouped;
  IF clashes IS NOT NULL THEN
    RAISE EXCEPTION 'Upgrade stopped (#2001): emails are now matched ignoring case and surrounding whitespace, and these user rows would share one address: %. Merge or delete the extra user rows, then upgrade again.', clashes;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "user" SET "email" = lower(regexp_replace("email", '^\s+|\s+$', '', 'g')) WHERE "email" <> lower(regexp_replace("email", '^\s+|\s+$', '', 'g'));
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_normalized";
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_normalized" CHECK ("user"."email" = lower(regexp_replace("user"."email", '^\s+|\s+$', '', 'g')));
