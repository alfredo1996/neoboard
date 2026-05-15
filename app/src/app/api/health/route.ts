import { db } from "@/lib/db";
import { validateEnvConfig } from "@/lib/env-config";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Returns environment config validation and database connectivity status.
 * Reports which vars are set/unset (never actual values).
 * Returns 200 for ok/degraded, 503 for error (missing required vars or DB unreachable).
 */
export async function GET() {
  const result = validateEnvConfig();

  let dbStatus: { status: "ok" | "error"; latencyMs: number } = {
    status: "error",
    latencyMs: -1,
  };
  try {
    const start = performance.now();
    await db.execute(sql`SELECT 1`);
    dbStatus = {
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch {
    dbStatus = { status: "error", latencyMs: -1 };
  }

  const envFailed = result.status === "error";
  const dbFailed = dbStatus.status === "error";
  const overallStatus = envFailed || dbFailed ? "error" : result.status;
  const httpStatus = overallStatus === "error" ? 503 : 200;

  return NextResponse.json(
    {
      data: {
        status: overallStatus,
        errors: result.errors,
        warnings: result.warnings,
        config: result.config,
        db: dbStatus,
      },
      error: null,
      meta: null,
    },
    { status: httpStatus },
  );
}
