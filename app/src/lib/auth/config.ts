import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { loginRateLimiter } from "@/lib/crypto/rate-limiter";
import { authLogger } from "@/lib/logger";

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
 * same account, but will be anonymized when LOG_ANONYMIZE=true lands
 * (see #128 slice 4).
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
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
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
        const requestId = request?.headers?.get?.("x-request-id") ?? undefined;
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
          .where(eq(users.email, parsed.data.email))
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
  ],
  callbacks: {
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
      // Re-fetch role and canWrite on every token refresh so DB changes propagate to active sessions.
      // Wrapped in try/catch so a transient DB hiccup (e.g. dev-server restart) doesn't
      // destroy the session — existing token values are preserved as a fallback.
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
            })
            .from(users)
            .where(eq(users.id, token.id as string))
            .limit(1);
          if (!dbUser) return null; // User deleted — invalidate token
          if (dbUser.disabledAt) return null; // User disabled — invalidate token
          token.role = dbUser.role;
          token.canWrite = dbUser.canWrite;
          token.forcePasswordChange = dbUser.forcePasswordChange;
          token.name = dbUser.name;
          token.tenantId = dbUser.tenantId;
        } catch {
          // DB unavailable — keep existing token values (graceful degradation)
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
  events: {
    async signOut(message) {
      // NextAuth v5 signOut payload carries the token or session depending
      // on the strategy. JWT strategy (what we use) includes a `token` key.
      const token = message && "token" in message ? message.token : undefined;
      const userId =
        token && typeof token.id === "string" ? token.id : undefined;
      authLogger.info({ event: "sign_out", userId }, "sign_out");
    },
  },
});

export const { GET, POST } = handlers;
