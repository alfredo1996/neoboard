import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { forbidden } from "@/lib/api/api-utils";
import { apiList } from "@/lib/api/api-response";

/**
 * GET /api/audit-logs
 *
 * Returns paginated audit log entries (admin only).
 * Supports filtering by action, userId, resourceType, and date range.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") return forbidden();

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)),
  );
  const offset = (page - 1) * limit;

  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const resourceType = url.searchParams.get("resourceType");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const conditions = [eq(auditLogs.tenantId, session.tenantId)];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
  if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
  if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return apiList(rows, {
    total,
    limit,
    offset,
  });
}
