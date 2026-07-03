import { db } from "@/lib/db";
import { validateEnvConfig } from "@/lib/env-config";
import { requireSession } from "@/lib/auth/session";
import { listSchedulers } from "@/lib/query/scheduler-registry";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../../../package.json";

/**
 * GET /api/health
 *
 * Public (probe-friendly): env config validation + database connectivity.
 * Reports which vars are set/unset (never actual values).
 * Admin sessions additionally get version, migration status and per-connector
 * scheduler stats (#930) — deploy intel stays off the unauthenticated surface.
 * Returns 200 for ok/degraded, 503 for error.
 */

/** Applied-migration status from drizzle's bookkeeping table + the journal. */
async function migrationStatus() {
  try {
    const rows = (await db.execute(
      sql`SELECT count(*)::int AS applied, max(created_at) AS last_applied_at FROM drizzle.__drizzle_migrations`,
    )) as unknown as Array<{ applied: number; last_applied_at: number }>;
    const applied = rows[0]?.applied ?? 0;
    const lastAppliedAt = rows[0]?.last_applied_at ?? null;

    // Expected count from the journal the migrator runs against. Missing or
    // unreadable journal (unusual images) degrades to expected: null.
    let expected: number | null = null;
    try {
      const journalPath = join(
        process.env.MIGRATIONS_DIR ?? "drizzle/migrations",
        "meta/_journal.json",
      );
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
        entries: unknown[];
      };
      expected = journal.entries.length;
    } catch {
      expected = null;
    }

    return {
      applied,
      lastAppliedAt,
      expected,
      upToDate: expected === null ? null : applied >= expected,
    };
  } catch {
    return {
      applied: null,
      lastAppliedAt: null,
      expected: null,
      upToDate: null,
    };
  }
}

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

  // Admin-only extended payload (#930). Health must never fail on auth,
  // so an anonymous or non-admin caller just gets the public shape.
  let extended: Record<string, unknown> = {};
  try {
    const session = await requireSession();
    if (session.role === "admin") {
      extended = {
        version: { app: pkg.version, node: process.version },
        migrations: await migrationStatus(),
        schedulers: listSchedulers().map(({ connectionId, scheduler }) => ({
          connectionId,
          ...scheduler.getStats(),
        })),
      };
    }
  } catch {
    // unauthenticated — public payload only
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
        ...extended,
      },
      error: null,
      meta: null,
    },
    { status: httpStatus },
  );
}
