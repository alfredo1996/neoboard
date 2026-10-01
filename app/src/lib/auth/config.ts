import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { revokedSessions, users } from "@/lib/db/schema";
import { loginRateLimiter } from "@/lib/crypto/rate-limiter";
import { getCachedSsoProviders } from "@/lib/auth/sso/provider-cache";
import { resolveRoleFromClaims } from "@/lib/auth/sso/claim-mapping";
import type { LoadedSsoProvider } from "@/lib/auth/sso/provider-loader";
import { authLogger, logger } from "@/lib/logger";
import { isTenantIdSet, resolveTenantId } from "@/lib/auth/tenant-id";
import { emailSchema, normalizeEmail } from "@/lib/auth/email-schema";
import { tenantScopedAdapter } from "@/lib/auth/tenant-adapter";
import { randomId } from "@/lib/random-id";

/** Reasons an authorize() call can fail. */
type SignInFailureReason =
  | "invalid_input"
  | "rate_limited"
  | "user_not_found"
  | "user_disabled"
  | "bad_password";

/**
 * Log a failed sign-in attempt. Never includes the password. Email is
 * included so operators can correlate multiple failures against the
 * same account; with LOG_ANONYMIZE=true it is logged as a keyed hash
 * instead (`log-anonymizer.ts`), which still correlates them.
 */
function logSignInFailed(
  email: string | undefined,
  reason: SignInFailureReason,
  requestId?: string,
): void {
  authLogger.warn(
    { event: "sign_in_failed", email, reason, requestId },
    "sign_in_failed",
  );
}

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6),
});

// Module scope, not the per-flow factory below: TENANT_ID cannot change while
// the process runs, so warn once at load instead of on every login (#1338).
const tenantId = resolveTenantId();
if (!isTenantIdSet()) {
  logger.warn(
    "TENANT_ID not set (or blank) — defaulting to 'default'. Set TENANT_ID explicitly for multi-tenant deployments.",
  );
}

const sessionMaxAge = Number.parseInt(
  process.env.SESSION_MAX_AGE || "28800",
  10,
);

/**
 * Ends one session for good (#2138): every session read re-sets the cookie,
 * so a read in flight at sign-out puts the token back, and the jwt callback
 * refuses it by this row. Every token carrying the sid was issued by now and
 * lives at most sessionMaxAge, read with 15 s of clock tolerance; the row
 * outlives them by a minute.
 */
async function revokeSession(token: JWT | null | undefined): Promise<void> {
  if (!token?.sid || !token.tenantId) return; // issued before #2138
  await db
    .insert(revokedSessions)
    .values({
      tenantId: token.tenantId,
      sid: token.sid,
      expiresAt: new Date(Date.now() + (sessionMaxAge + 60) * 1000),
    })
    .onConflictDoNothing();
  // An expired row refuses nothing: the tokens it names have expired too.
  await db
    .delete(revokedSessions)
    .where(
      and(
        eq(revokedSessions.tenantId, token.tenantId),
        lt(revokedSessions.expiresAt, new Date()),
      ),
    );
}

/**
 * Auth.js config uses lazy initialization so SSO providers can be loaded
 * dynamically from the database on each auth flow. The Credentials provider
 * is always present; OIDC providers are appended from the DB with a 60s cache.
 */
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(
  async () => {
    const ssoProviders = await getCachedSsoProviders(tenantId);

    return {
      trustHost: true,
      adapter: tenantScopedAdapter(tenantId),
      session: {
        strategy: "jwt",
        maxAge: sessionMaxAge,
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
            const requestId =
              request?.headers?.get?.("x-request-id") ?? undefined;
            const rawEmail =
              typeof credentials?.email === "string"
                ? credentials.email
                : undefined;

            const parsed = loginSchema.safeParse(credentials);
            if (!parsed.success) {
              logSignInFailed(rawEmail, "invalid_input", requestId);
              return null;
            }

            // Rate limit by IP — 20 attempts per minute.
            // In deployments behind a reverse proxy (Vercel, nginx), the first
            // x-forwarded-for value is the client IP set by the trusted proxy.
            const forwarded = request?.headers?.get?.("x-forwarded-for");
            const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
            const rateResult = loginRateLimiter.check(ip);
            if (!rateResult.allowed) {
              logSignInFailed(parsed.data.email, "rate_limited", requestId);
              return null;
            }

            const user = await db
              .select()
              .from(users)
              .where(
                and(
                  eq(users.email, parsed.data.email),
                  eq(users.tenantId, tenantId),
                ),
              )
              .limit(1)
              .then((rows) => rows[0]);

            if (!user?.passwordHash) {
              logSignInFailed(parsed.data.email, "user_not_found", requestId);
              return null;
            }
            if (user.disabledAt) {
              logSignInFailed(parsed.data.email, "user_disabled", requestId);
              return null;
            }

            const isValid = await bcrypt.compare(
              parsed.data.password,
              user.passwordHash,
            );
            if (!isValid) {
              logSignInFailed(parsed.data.email, "bad_password", requestId);
              return null;
            }

            // Update lastLoginAt (fire-and-forget — don't block login on this)
            db.update(users)
              .set({ lastLoginAt: new Date() })
              .where(eq(users.id, user.id))
              .then(
                () => {},
                (err) =>
                  authLogger.warn(
                    { event: "last_login_update_failed", userId: user.id, err },
                    "last_login_update_failed",
                  ),
              );

            authLogger.info(
              {
                event: "sign_in",
                userId: user.id,
                tenantId: user.tenantId,
                requestId,
              },
              "sign_in",
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
          if (!account?.provider.startsWith("sso-")) {
            return true;
          }

          // Find the matching SSO provider metadata from cache
          const providerConfig = ssoProviders.find(
            (p: LoadedSsoProvider) => p.id === account.provider,
          );
          if (!providerConfig) return false;

          const { claimMappings, autoProvision, defaultRole } =
            providerConfig.metadata;

          // Emails are stored lowercased and trimmed (#2001). On a first
          // sign-in with this provider, @auth/core passes this same `user`
          // object on to the adapter's getUserByEmail (linking) and
          // createUser (provisioning), so normalizing it in place keeps both
          // on the stored form. That object identity is @auth/core's
          // behaviour (lib/actions/callback/index.js), checked against the
          // installed version; config.test.ts "the SSO signIn callback looks
          // up and hands on the IdP email lowercased" pins only the mutation.
          // The jwt and session callbacks read the user from the database
          // row, not from this object.
          const email = normalizeEmail(user.email ?? "");
          if (user.email) user.email = email;

          // Check if user already exists in the DB
          const existingUsers = await db
            .select({ id: users.id, disabledAt: users.disabledAt })
            .from(users)
            .where(and(eq(users.email, email), eq(users.tenantId, tenantId)))
            .limit(1);

          // Refused before the role sync below writes anything, as
          // authorize() refuses one; the jwt callback's refusal comes after
          // the write is committed (#2005).
          if (existingUsers[0]?.disabledAt) return false;

          if (existingUsers.length === 0 && !autoProvision) {
            // Auto-provision is off and user doesn't exist — reject login
            return false;
          }

          // Resolve role from IdP claims and sync to DB
          const resolvedRole = resolveRoleFromClaims(
            (profile ?? {}) as Record<string, unknown>,
            claimMappings,
            defaultRole,
          );

          if (existingUsers.length > 0) {
            // Existing user: sync role from IdP claims on every login
            await db
              .update(users)
              .set({
                role: resolvedRole,
                canWrite: resolvedRole !== "reader",
                lastLoginAt: new Date(),
              })
              .where(
                and(
                  eq(users.id, existingUsers[0].id),
                  eq(users.tenantId, tenantId),
                ),
              );
          }

          // For new users: the adapter creates the user record in this
          // tenant (tenant-adapter.ts, #2018). The JWT callback will pick up
          // the role from DB on next refresh.

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
              (user as { tenantId?: string }).tenantId ?? resolveTenantId();
          }
          // The session's own id, which sign-out revokes (#2138).
          token.sid ??= randomId();
          // Re-fetch role and canWrite on every token refresh so DB changes propagate to active sessions.
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
                  revokedSid: revokedSessions.sid,
                })
                .from(users)
                .leftJoin(
                  revokedSessions,
                  and(
                    eq(revokedSessions.tenantId, token.tenantId as string),
                    eq(revokedSessions.sid, token.sid),
                  ),
                )
                .where(
                  and(
                    eq(users.id, token.id as string),
                    eq(users.tenantId, token.tenantId as string),
                  ),
                )
                .limit(1);
              // User deleted, disabled or signed out — invalidate token.
              if (!dbUser || dbUser.disabledAt || dbUser.revokedSid) {
                return null;
              }
              // Invalidate tokens issued before the most recent password change.
              // 30s grace window prevents racing the issuance of the new token.
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
              // The lookup is the revocation check, so a sign-in it could not
              // check is refused (#2004). An existing session keeps its token:
              // every data route fails while the database does, and the next
              // call re-checks once it is back, so a blip on the session poll
              // does not sign anyone out mid-edit.
              if (user) return null;
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
            session.user.tenantId = token.tenantId ?? resolveTenantId();
          }
          return session;
        },
      },
      events: {
        async signOut(message) {
          // NextAuth v5 signOut payload carries the token or session depending
          // on the strategy. JWT strategy (what we use) includes a `token` key.
          const token =
            message && "token" in message ? message.token : undefined;
          const userId =
            token && typeof token.id === "string" ? token.id : undefined;
          authLogger.info({ event: "sign_out", userId }, "sign_out");
          await revokeSession(token);
        },
      },
    };
  },
);

export const { GET, POST } = handlers;
