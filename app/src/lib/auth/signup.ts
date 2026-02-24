"use server";

import crypto from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type SignupResult =
  | { success: true }
  | { success: false; error: string };

export async function areUsersEmpty(): Promise<boolean> {
  const result = await db.select({ id: users.id }).from(users).limit(1);
  return result.length === 0;
}

export async function signup(formData: FormData): Promise<SignupResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  const { name, email, password } = parsed.data;

  const isEmpty = await areUsersEmpty();
  let role: "admin" | "creator" = "creator";

  if (isEmpty) {
    const token = formData.get("bootstrapToken") as string | null;
    const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
    const tokenValid =
      token &&
      expected &&
      Buffer.byteLength(token, "utf8") === Buffer.byteLength(expected, "utf8") &&
      crypto.timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"));
    if (!tokenValid) {
      return {
        success: false,
        error: "Bootstrap token required to create the first admin account.",
      };
    }
    role = "admin";
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return { success: false as const, error: "An account with this email already exists" };
    }

    // Re-check inside the transaction to close the TOCTOU window for admin bootstrap
    if (role === "admin") {
      const anyUser = await tx.select({ id: users.id }).from(users).limit(1);
      if (anyUser.length > 0) {
        return { success: false as const, error: "Admin already bootstrapped" };
      }
    }

    await tx.insert(users).values({ name, email, passwordHash, role });
    return { success: true as const };
  });
}
