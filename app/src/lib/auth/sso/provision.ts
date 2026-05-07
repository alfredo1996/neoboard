import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";

interface SsoUserInput {
  email: string;
  name: string | null;
  image: string | null;
  resolvedRole: UserRole;
  tenantId: string;
  autoProvision: boolean;
}

interface SsoUserResult {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  canWrite: boolean;
  forcePasswordChange: boolean;
  tenantId: string;
  image: string | null;
}

/**
 * Provision or link an SSO user during OIDC callback.
 *
 * - If user exists (email + tenantId match): update role from claims + lastLoginAt, return user.
 * - If user doesn't exist and autoProvision is true: create new user with resolved role.
 * - If user doesn't exist and autoProvision is false: return null (login rejected).
 */
export async function provisionOrLinkSsoUser(
  input: SsoUserInput,
): Promise<SsoUserResult | null> {
  const { email, name, image, resolvedRole, tenantId, autoProvision } = input;

  // Look up existing user by email + tenant
  const [existingUser] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      canWrite: users.canWrite,
      forcePasswordChange: users.forcePasswordChange,
      tenantId: users.tenantId,
      image: users.image,
    })
    .from(users)
    .where(and(eq(users.email, email), eq(users.tenantId, tenantId)));

  if (existingUser) {
    // Link: update role from IdP claims and lastLoginAt
    await db
      .update(users)
      .set({
        role: resolvedRole,
        canWrite: resolvedRole !== "reader",
        lastLoginAt: new Date(),
        name: name ?? existingUser.name,
        image: image ?? existingUser.image,
      })
      .where(eq(users.id, existingUser.id));

    return {
      ...existingUser,
      role: resolvedRole,
      canWrite: resolvedRole !== "reader",
      name: name ?? existingUser.name,
      image: image ?? existingUser.image,
    };
  }

  // No existing user — check auto-provision
  if (!autoProvision) {
    return null;
  }

  // Provision new user
  const canWrite = resolvedRole !== "reader";

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      name,
      image,
      role: resolvedRole,
      canWrite,
      forcePasswordChange: false,
      tenantId,
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      canWrite: users.canWrite,
      forcePasswordChange: users.forcePasswordChange,
      tenantId: users.tenantId,
      image: users.image,
    });

  return newUser;
}
