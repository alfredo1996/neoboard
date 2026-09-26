import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";

/**
 * The Drizzle adapter, scoped to one tenant (#2018). Its own user lookups
 * match on the email or the linked account alone, and its insert sets no
 * tenant, so an SSO sign-in could link to, or be created in, another tenant's
 * user with the same address. A sign-in reaches user rows only through these
 * three methods; the rest are the adapter's own.
 */
export function tenantScopedAdapter(tenantId: string): Adapter {
  const base = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });
  return {
    ...base,
    createUser: (user) =>
      // AdapterUser has no tenantId; the users table does.
      base.createUser!({ ...user, tenantId } as AdapterUser),
    async getUserByEmail(email) {
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), eq(users.tenantId, tenantId)))
        .limit(1);
      return (user as AdapterUser | undefined) ?? null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const [row] = await db
        .select({ user: users })
        .from(accounts)
        .innerJoin(users, eq(accounts.userId, users.id))
        .where(
          and(
            eq(accounts.provider, provider),
            eq(accounts.providerAccountId, providerAccountId),
            eq(users.tenantId, tenantId),
          ),
        )
        .limit(1);
      return (row?.user as AdapterUser | undefined) ?? null;
    },
  };
}
