import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { loginRateLimiter } from "@/lib/rate-limiter";

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
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Rate limit by IP — 20 attempts per minute.
        // In deployments behind a reverse proxy (Vercel, nginx), the first
        // x-forwarded-for value is the client IP set by the trusted proxy.
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

        // Update lastLoginAt (fire-and-forget — don't block login on this)
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
        token.tenantId = process.env.TENANT_ID ?? "default";
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
            })
            .from(users)
            .where(eq(users.id, token.id as string))
            .limit(1);
          if (!dbUser) return null; // User deleted — invalidate token
          if (dbUser.disabledAt) return null; // User disabled — invalidate token
          token.role = dbUser.role;
          token.canWrite = dbUser.canWrite;
          token.forcePasswordChange = dbUser.forcePasswordChange;
        } catch {
          // DB unavailable — keep existing token values (graceful degradation)
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
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
});

export const { GET, POST } = handlers;
