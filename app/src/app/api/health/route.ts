import { validateEnvConfig } from "@/lib/env-config";
import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Returns environment config validation status.
 * Reports which vars are set/unset (never actual values).
 * Returns 200 for ok/degraded, 503 for error (missing required vars).
 */
export async function GET() {
  const result = validateEnvConfig();
  const status = result.status === "error" ? 503 : 200;

  return NextResponse.json(
    {
      data: {
        status: result.status,
        errors: result.errors,
        warnings: result.warnings,
        config: result.config,
      },
      error: null,
      meta: null,
    },
    { status },
  );
}
