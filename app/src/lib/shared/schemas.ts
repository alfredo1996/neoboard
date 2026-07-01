import { z } from "zod";
import { isRegisteredConnectorType } from "@/lib/connector/registered-types";

/**
 * Shared Zod schemas for API route validation.
 * Extracted to avoid duplication across connection routes.
 */

/**
 * Connector type accepted by the API — any type registered in the connector
 * registry (built-in or external), not a hardcoded union (#1121).
 */
const connectorTypeSchema = z
  .string()
  .min(1)
  .refine(isRegisteredConnectorType, { message: "Unknown connector type" });

export const connectionConfigSchema = z.object({
  uri: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().optional(),
  // Advanced pool/timeout settings (optional, sensible defaults)
  connectionTimeout: z.number().int().min(1000).max(300_000).optional(),
  queryTimeout: z.number().int().min(1000).max(300_000).optional(),
  maxPoolSize: z.number().int().min(1).max(100).optional(),
  connectionAcquisitionTimeout: z
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .optional(),
  idleTimeout: z.number().int().min(1000).max(300_000).optional(),
  statementTimeout: z.number().int().min(1000).max(300_000).optional(),
  sslRejectUnauthorized: z.boolean().optional(),
  /**
   * Max rows returned by read queries on this connection. Results beyond
   * this cap are truncated and the widget shows a "Showing first N rows"
   * banner. Default `DEFAULT_MAX_ROWS` (5000). Raise cautiously — each
   * extra row linearly increases per-query memory footprint.
   */
  maxRows: z.number().int().min(100).max(100_000).optional(),
});

export const createConnectionSchema = z.object({
  name: z.string().min(1),
  type: connectorTypeSchema,
  config: connectionConfigSchema,
});

/** Config schema for updates — password is optional (omit to keep existing). */
export const updateConnectionConfigSchema = connectionConfigSchema.extend({
  password: z.string().min(1).optional(),
});

export const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  config: updateConnectionConfigSchema.optional(),
  /** #901 — admin-only; toggles tenant-wide read/query access. */
  visibility: z.enum(["private", "shared"]).optional(),
});

export const testInlineSchema = z.object({
  type: connectorTypeSchema,
  config: connectionConfigSchema,
});
