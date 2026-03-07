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
