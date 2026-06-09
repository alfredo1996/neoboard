import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authLogger } from "@/lib/logger";

/**
 * Creates the first admin user if the users table is empty.
 * Runs inside a serializable transaction to prevent TOCTOU races on
 * concurrent replicas.
 *
 * Safe to call on every startup — once any user exists it is a no-op.
 */
export async function bootstrapAdmin({
  email,
  password,
  name,
  tenantId,
}: {
  email: string;
  password: string;
  /**
   * Optional display name for the bootstrapped admin. Falls back to "Admin"
   * when not provided or empty.
   */
  name?: string;
  /**
   * Optional tenant identifier. Overrides the TENANT_ID env var. Falls back
   * to TENANT_ID, then to "default" when neither is set or both are empty.
   */
  tenantId?: string;
}) {
  if (
    password.length < 8 ||
    !/[a-zA-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters with at least one letter and one number",
    );
  }

  await db.transaction(
    async (tx) => {
      const existing = await tx.select({ id: users.id }).from(users).limit(1);

      if (existing.length > 0) {
        // Already bootstrapped — nothing to do
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const resolvedName = name && name.length > 0 ? name : "Admin";
      const resolvedTenantId =
        tenantId && tenantId.length > 0
          ? tenantId
          : (process.env.TENANT_ID ?? "default");
      await tx.insert(users).values({
        name: resolvedName,
        email,
        passwordHash,
        role: "admin",
        tenantId: resolvedTenantId,
      });

      authLogger.info(
        { event: "admin_bootstrap_succeeded" },
        "admin_bootstrap_succeeded",
      );
    },
    { isolationLevel: "serializable" },
  );
}
