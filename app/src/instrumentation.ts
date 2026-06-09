/**
 * Next.js instrumentation hook — runs once on cold start before any request.
 * Used to bootstrap the first admin user when the database is empty.
 *
 * Configure via environment variables:
 *   BOOTSTRAP_ADMIN_EMAIL    — email of the initial admin user (required)
 *   BOOTSTRAP_ADMIN_PASSWORD — password (min 8 chars) of the initial admin
 *                              user (required)
 *   BOOTSTRAP_ADMIN_NAME     — optional display name (defaults to "Admin")
 *   BOOTSTRAP_ADMIN_TENANT   — optional tenant id (defaults to TENANT_ID
 *                              env, then "default")
 *
 * If EMAIL or PASSWORD is absent the bootstrap step is silently skipped.
 * Once any user exists in the database the function is permanently a no-op.
 */
export async function register() {
  // Only run in the Node.js runtime (not in the Edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fail fast on missing/invalid required env vars (ENCRYPTION_KEY,
  // NEXTAUTH_SECRET, DATABASE_URL). Previously these only surfaced at
  // request time as cryptic decryption / JWT errors. Escape hatch:
  // SKIP_ENV_VALIDATION=1 for one-off scripts and build pipelines.
  if (process.env.SKIP_ENV_VALIDATION !== "1") {
    const { validateEnvConfig } = await import("@/lib/env-config");
    const result = validateEnvConfig();
    if (result.status === "error") {
      // Write to stderr directly — the structured logger may not be
      // configured yet, and we want this to be the first thing operators
      // see when the container fails to start.
      process.stderr.write(
        "\n✗ NeoBoard cannot start — required environment variables are missing or invalid:\n\n",
      );
      for (const issue of result.errors) {
        process.stderr.write(`  • ${issue.message}\n`);
      }
      process.stderr.write(
        "\nFix the values above (see app/.env.example) and restart.\n" +
          "To bypass for build/migration scripts: SKIP_ENV_VALIDATION=1\n\n",
      );
      process.exit(1);
    }
  }

  const { logger, authLogger } = await import("@/lib/logger");

  // Register built-in query middleware (audit logging, etc.) before any
  // query route has a chance to run. Runs once per cold start.
  try {
    const { bootstrapQueryMiddleware } =
      await import("@/lib/query/middleware/bootstrap");
    bootstrapQueryMiddleware();
  } catch (err) {
    logger.error(
      { event: "query_middleware_bootstrap_failed", err },
      "query_middleware_bootstrap_failed",
    );
  }

  // Start the periodic scheduler metrics emitter. Idle schedulers are
  // skipped so there's no log spam when the server is quiet.
  try {
    const { startSchedulerMetricsEmitter } =
      await import("@/lib/query/scheduler-metrics");
    startSchedulerMetricsEmitter();
  } catch (err) {
    logger.error(
      { event: "scheduler_metrics_start_failed", err },
      "scheduler_metrics_start_failed",
    );
  }

  // Bootstrap the first admin user when the database is empty.
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME;
  const tenantId = process.env.BOOTSTRAP_ADMIN_TENANT;

  if (!email || !password) return;

  try {
    const { bootstrapAdmin } = await import("@/lib/auth/bootstrap");
    await bootstrapAdmin({ email, password, name, tenantId });
  } catch (err) {
    // Log but never crash the server — a missing DB at startup is recoverable
    authLogger.error(
      { event: "admin_bootstrap_failed", err },
      "admin_bootstrap_failed",
    );
  }
}
