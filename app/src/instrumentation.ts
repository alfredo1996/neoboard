/**
 * Next.js instrumentation hook — runs once on cold start before any request.
 * Used to bootstrap the first admin user when the database is empty.
 *
 * Configure via environment variables:
 *   BOOTSTRAP_ADMIN_EMAIL    — email of the initial admin user
 *   BOOTSTRAP_ADMIN_PASSWORD — password (min 6 chars) of the initial admin user
 *
 * If either var is absent the bootstrap step is silently skipped.
 * Once any user exists in the database the function is permanently a no-op.
 */
export async function register() {
  // Only run in the Node.js runtime (not in the Edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) return;

  try {
    const { bootstrapAdmin } = await import("@/lib/bootstrap");
    await bootstrapAdmin({ email, password });
  } catch (err) {
    // Log but never crash the server — a missing DB at startup is recoverable
    console.error("[bootstrap] Failed to bootstrap admin user:", err);
  }
}
