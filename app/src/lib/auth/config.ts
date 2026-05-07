import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { loginRateLimiter } from "@/lib/crypto/rate-limiter";
import { getCachedSsoProviders } from "@/lib/auth/sso/provider-cache";
import { resolveRoleFromClaims } from "@/lib/auth/sso/claim-mapping";
import { provisionOrLinkSsoUser } from "@/lib/auth/sso/provision";
import type { LoadedSsoProvider } from "@/lib/auth/sso/provider-loader";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * Auth.js config uses lazy initialization so SSO providers can be loaded
 * dynamically from the database on each auth flow. The Credentials provider
 * is always present; OIDC providers are appended from the DB with a 60s cache.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const tenantId = process.env.TENANT_ID ?? "default";
  const ssoProviders = await getCachedSsoProviders(tenantId);

  return {
    trustHost: true,
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: {
      strategy: "jwt",
      maxAge: parseInt(process.env.SESSION_MAX_AGE || "28800", 10),
    },
    pages: {
      signIn: "/login",
    },
    providers: [
      Credentials({
        name: "Email & Password",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials, request) {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const forwarded = request?.headers?.get?.("x-forwarded-for");
          const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
          const rateResult = loginRateLimiter.check(ip);
          if (!rateResult.allowed) return null;

          const user = await db
            .select()
            .from(users)
            .where(eq(users.email, parsed.data.email))
            .limit(1)
            .then((rows) => rows[0]);

          if (!user?.passwordHash) return null;
          if (user.disabledAt) return null;

          const isValid = await bcrypt.compare(
            parsed.data.password,
            user.passwordHash,
          );
          if (!isValid) return null;

          db.update(users)
            .set({ lastLoginAt: new Date() })
            .where(eq(users.id, user.id))
            .then(
              () => {},
              (err) => console.error("[auth] lastLoginAt update failed", err),
            );

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            canWrite: user.canWrite,
            forcePasswordChange: user.forcePasswordChange,
            tenantId: user.tenantId,
          };
        },
      }),
      // Dynamic OIDC providers loaded from sso_providers table
      ...ssoProviders,
    ],
    callbacks: {
      async signIn({ user, account, profile }) {
        // Only intercept SSO logins (provider id starts with "sso-")
        if (!account || !account.provider.startsWith("sso-")) {
          return true;
        }

        // Find the matching SSO provider metadata from cache
        const providerConfig = ssoProviders.find(
          (p: LoadedSsoProvider) => p.id === account.provider,
        );
        if (!providerConfig) return true;

        const { claimMappings, autoProvision, defaultRole } =
          providerConfig.metadata;

        // Resolve role from IdP claims
        const resolvedRole = resolveRoleFromClaims(
          (profile ?? {}) as Record<string, unknown>,
          claimMappings,
          defaultRole,
        );

        // Provision or link the SSO user
        const ssoUser = await provisionOrLinkSsoUser({
          email: user.email ?? "",
          name: (profile?.name as string) ?? user.name ?? null,
          image: (profile?.picture as string) ?? user.image ?? null,
          resolvedRole,
          tenantId,
          autoProvision,
        });

        if (!ssoUser) {
          // Auto-provision is off and user doesn't exist — reject login
          return false;
        }

        // Attach provisioned user data so the JWT callback can read it
        user.id = ssoUser.id;
        user.name = ssoUser.name;
        user.email = ssoUser.email;
        user.image = ssoUser.image;
        (user as Record<string, unknown>).role = ssoUser.role;
        (user as Record<string, unknown>).canWrite = ssoUser.canWrite;
        (user as Record<string, unknown>).forcePasswordChange = false;
        (user as Record<string, unknown>).tenantId = ssoUser.tenantId;

        return true;
      },

      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          token.role = user.role;
          token.canWrite = (user as { canWrite?: boolean }).canWrite ?? true;
          token.forcePasswordChange =
            (user as { forcePasswordChange?: boolean }).forcePasswordChange ??
            false;
          token.tenantId =
            (user as { tenantId?: string }).tenantId ??
            process.env.TENANT_ID ??
            "default";
        }
        if (token.id) {
          try {
            const [dbUser] = await db
              .select({
                role: users.role,
                canWrite: users.canWrite,
                disabledAt: users.disabledAt,
                forcePasswordChange: users.forcePasswordChange,
                name: users.name,
                tenantId: users.tenantId,
                passwordChangedAt: users.passwordChangedAt,
              })
              .from(users)
              .where(eq(users.id, token.id as string))
              .limit(1);
            if (!dbUser) return null;
            if (dbUser.disabledAt) return null;
            if (
              token.iat &&
              dbUser.passwordChangedAt &&
              dbUser.passwordChangedAt.getTime() >
                (token.iat as number) * 1000 + 30_000
            ) {
              return null;
            }
            token.role = dbUser.role;
            token.canWrite = dbUser.canWrite;
            token.forcePasswordChange = dbUser.forcePasswordChange;
            token.name = dbUser.name;
            token.tenantId = dbUser.tenantId;
          } catch {
            // DB unavailable — keep existing token values
          }
        }
        return token;
      },

      async session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id as string;
          session.user.name = token.name as string;
          session.user.role = token.role;
          session.user.canWrite = (token.canWrite as boolean) ?? true;
          session.user.forcePasswordChange =
            (token.forcePasswordChange as boolean) ?? false;
          session.user.tenantId =
            token.tenantId ?? process.env.TENANT_ID ?? "default";
        }
        return session;
      },
    },
  };
});

export const { GET, POST } = handlers;
