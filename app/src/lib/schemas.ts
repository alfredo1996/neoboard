import { z } from "zod";

/**
 * Shared Zod schemas for API route validation.
 * Extracted to avoid duplication across connection routes.
 */

export const connectionConfigSchema = z.object({
  uri: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().optional(),
  // Advanced pool/timeout settings (optional, sensible defaults)
  connectionTimeout: z.number().int().min(1000).max(300_000).optional(),
  queryTimeout: z.number().int().min(1000).max(300_000).optional(),
  maxPoolSize: z.number().int().min(1).max(100).optional(),
  connectionAcquisitionTimeout: z.number().int().min(1000).max(300_000).optional(),
  idleTimeout: z.number().int().min(1000).max(300_000).optional(),
  statementTimeout: z.number().int().min(1000).max(300_000).optional(),
  sslRejectUnauthorized: z.boolean().optional(),
});

export const createConnectionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["neo4j", "postgresql"]),
  config: connectionConfigSchema,
});

export const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  config: connectionConfigSchema.optional(),
});

export const testInlineSchema = z.object({
  type: z.enum(["neo4j", "postgresql"]),
  config: connectionConfigSchema,
});
