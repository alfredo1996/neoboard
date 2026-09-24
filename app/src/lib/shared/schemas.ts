import { z } from "zod";
import { isRegisteredConnectorType } from "@/lib/connector/registered-types";
import { MAX_ROWS_BOUNDS } from "@/lib/connector/connection-form";

/**
 * Shared Zod schemas for API route validation.
 * Extracted to avoid duplication across connection routes.
 */

/**
 * Connector type accepted by the API — any type registered in the connector
 * registry (built-in or external), not a hardcoded union (#1121).
 */
export const connectorTypeSchema = z
  .string()
  .min(1)
  .refine(isRegisteredConnectorType, { message: "Unknown connector type" });

/**
 * A connection's config, as far as zod is concerned: a bag. Which keys it
 * holds, which are required and what each may be is the CONNECTOR's business —
 * the route checks the bag against the connector's descriptor
 * (`validateConnectionConfig`, #1901), which also strips every key the
 * descriptor does not declare. No connector option is spelled out here.
 *
 * The one key the app owns is `maxRows`, its row-limit policy: results beyond
 * the cap are truncated and the widget shows a "Showing first N rows" banner.
 * Default `DEFAULT_MAX_ROWS` (5000). Raise cautiously — each extra row
 * linearly increases per-query memory footprint.
 */
const connectionConfigSchema = z.looseObject({
  maxRows: z
    .number()
    .int()
    .min(MAX_ROWS_BOUNDS.min)
    .max(MAX_ROWS_BOUNDS.max)
    .optional(),
});

export const createConnectionSchema = z.object({
  name: z.string().min(1),
  type: connectorTypeSchema,
  config: connectionConfigSchema,
});

export const updateConnectionSchema = z
  .object({
    name: z.string().min(1).optional(),
    /** Replaces the stored config; a secret left blank keeps its stored value. */
    config: connectionConfigSchema.optional(),
    /** #901 — admin-only; toggles tenant-wide read/query access. */
    visibility: z.enum(["private", "shared"]).optional(),
  })
  // A body naming nothing reached `.set({})`, which Drizzle refuses: 500 for
  // the caller's own empty request (#1983).
  .refine(
    (b) =>
      b.name !== undefined ||
      b.config !== undefined ||
      b.visibility !== undefined,
    { message: "Nothing to update: send name, config or visibility" },
  );

export const testInlineSchema = z.object({
  type: connectorTypeSchema,
  config: connectionConfigSchema,
});
