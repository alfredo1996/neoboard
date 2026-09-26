import { z } from "zod";

/**
 * Shared email schema: every address is stored and compared trimmed and
 * lowercased (#2001). trim/lowercase must come BEFORE .email(), or " a@x.com"
 * is rejected. The `user_email_normalized` check constraint backs this up for
 * any write path that skips the schema.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address");
