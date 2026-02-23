CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator', 'reader');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'creator' NOT NULL;
