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
