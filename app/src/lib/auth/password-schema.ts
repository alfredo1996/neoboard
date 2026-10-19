import { z } from "zod";

/**
 * Shared password validation schema for new passwords.
 * Used by signup, admin-create-user, password-change, and admin-reset-password endpoints.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/** The rule above in words, shown next to every new-password field. Keep in step with the schema. */
export const PASSWORD_HINT =
  "At least 8 characters, with a letter and a number.";
