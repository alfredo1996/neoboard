import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { clientIpFromRequest } from "@/lib/api/with-rate-limit";

/**
 * Audit action types. Use dotted notation: resource.verb.
 */
export type AuditAction =
  | "auth.login"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.api_key.used"
  | "query.execute"
  | "query.write"
  | "dashboard.create"
  | "dashboard.update"
  | "dashboard.delete"
  | "dashboard.share"
  | "dashboard.export"
  | "dashboard.import"
  | "dashboard.duplicate"
  | "connection.create"
  | "connection.update"
  | "connection.delete"
  | "user.create"
  | "user.update"
  | "user.disable"
  | "user.role.change"
  | "key.create"
  | "key.revoke";

export interface AuditEntry {
  tenantId: string;
  userId?: string | null;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit log write. Never throws — failures are logged
 * but don't interrupt the calling operation.
 *
 * NEVER include sensitive data (passwords, credentials, query parameters,
 * PII beyond email) in the details object.
 */
export function auditLog(entry: AuditEntry): void {
  const onFailure = (err: unknown) =>
    logger.warn({ err, action: entry.action }, "Failed to write audit log");

  // Belt and braces: `.catch` only covers a rejected promise. A driver that
  // throws synchronously (pool exhausted, client already closed) would
  // otherwise escape and fail the request that triggered the audit — the exact
  // opposite of fire-and-forget.
  try {
    void Promise.resolve(
      db.insert(auditLogs).values({
        tenantId: entry.tenantId,
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        details: entry.details,
        ipAddress: entry.ipAddress,
      }),
    ).catch(onFailure);
  } catch (err) {
    onFailure(err);
  }
}

/**
 * `auditLog` for route handlers: stamps the caller's IP from the request so
 * call sites stay one-liners and can't forget it.
 *
 * Same fire-and-forget contract — never throws, never fails the request that
 * triggered it. Pass `tenantId`/`userId` from `requireSession()`, never from
 * the request body.
 */
export function auditRequest(
  request: Request,
  entry: Omit<AuditEntry, "ipAddress">,
): void {
  let ipAddress = "unknown";
  try {
    ipAddress = clientIpFromRequest(request);
  } catch {
    // Request-like object without headers — the entry is still worth writing.
  }
  auditLog({ ...entry, ipAddress });
}
