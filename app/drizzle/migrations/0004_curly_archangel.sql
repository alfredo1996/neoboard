-- Sessions ended by sign-out (#2138). Auth.js re-sets the session cookie on
-- every session read, so a read in flight at sign-out put the signed-out
-- token back. The signOut event lists the token's sid here and the jwt
-- callback refuses a listed sid. The primary key is the (tenant_id, sid)
-- lookup index.
--
-- Idempotent as written: IF NOT EXISTS, and the key is created with the table.
CREATE TABLE IF NOT EXISTS "revoked_session" (
	"tenant_id" text NOT NULL,
	"sid" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "revoked_session_tenant_id_sid_pk" PRIMARY KEY("tenant_id","sid")
);
