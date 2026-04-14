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
}: {
  email: string;
  password: string;
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

      const tenantId = process.env.TENANT_ID ?? "default";
      await tx.insert(users).values({
        name: "Admin",
        email,
        passwordHash,
        role: "admin",
        tenantId,
      });

      authLogger.info(
        { event: "admin_bootstrap_succeeded" },
        "admin_bootstrap_succeeded",
      );
    },
    { isolationLevel: "serializable" },
  );
}
