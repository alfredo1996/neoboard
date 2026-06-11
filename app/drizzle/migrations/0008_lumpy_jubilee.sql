CREATE TYPE "public"."connection_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
ALTER TABLE "connection" ADD COLUMN "visibility" "connection_visibility" DEFAULT 'private' NOT NULL;