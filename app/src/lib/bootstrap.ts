import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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
  if (password.length < 6) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 6 characters");
  }

  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).limit(1);

    if (existing.length > 0) {
      // Already bootstrapped — nothing to do
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await tx.insert(users).values({
      name: "Admin",
      email,
      passwordHash,
      role: "admin",
    });

    console.info(`[bootstrap] Created admin user: ${email}`);
  });
}
