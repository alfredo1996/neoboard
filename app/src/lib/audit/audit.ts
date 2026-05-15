import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

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
  db.insert(auditLogs)
    .values({
      tenantId: entry.tenantId,
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      details: entry.details,
      ipAddress: entry.ipAddress,
    })
    .catch((err: unknown) => {
      logger.warn({ err, action: entry.action }, "Failed to write audit log");
    });
}
