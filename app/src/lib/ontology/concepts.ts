import { z } from "zod";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, ontologyConcepts } from "@/lib/db/schema";
import { decryptJson } from "@/lib/crypto/crypto";
import { fetchConnectionTerms } from "@/lib/connector/schema-prefetch";
import { usableConnection } from "@/lib/db/connection-access";
import { normalizeParamName } from "@/lib/parameter/normalize-param-name";
import { entityParentKey } from "@/lib/ontology/term-keys";
import { badRequest, forbidden, handleRouteError } from "@/lib/api/api-utils";
import { apiError } from "@/lib/api/api-response";
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import type { SchemaTerm } from "@neoboard/connection";
import type { UserRole } from "@/lib/db/schema";

export const MAX_NAME = 200;
export const MAX_DESCRIPTION = 2000;

/** A side names its entity and key by the term keys the connector reports. */
export const sideSchema = z.object({
  connectionId: z.string().min(1).max(200),
  entityKey: z.string().min(1).max(500),
  keyPropertyKey: z.string().min(1).max(500),
});
export type SideInput = z.infer<typeof sideSchema>;

/**
 * A parameter is consumed as `$param_<name>` and read back with `\w+`
 * (derive-form-fields), so a name is word characters, with a leading `param_`
 * stripped as every dashboard parameter does (#1055).
 */
const parameterSchema = z
  .string()
  .transform(normalizeParamName)
  .pipe(
    z
      .string()
      .regex(/^\w+$/, "Parameter may hold letters, digits and underscores only")
      .max(100, "Parameter is limited to 100 characters"),
  );

export const conceptFields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(MAX_NAME, "Name is limited to 200 characters"),
  parameter: parameterSchema,
  description: z
    .string()
    .max(MAX_DESCRIPTION, "Description is limited to 2,000 characters")
    .default(""),
  sides: z
    .array(sideSchema)
    .min(1, "A concept needs at least one side")
    .max(50)
    .superRefine((sides, ctx) => {
      const seen = new Set<string>();
      for (const s of sides) {
        const k = JSON.stringify([
          s.connectionId,
          s.entityKey,
          s.keyPropertyKey,
        ]);
        if (seen.has(k)) {
          ctx.addIssue({
            code: "custom",
            message: "Two sides are the same: remove one",
          });
          return;
        }
        seen.add(k);
      }
    }),
};

const UNIQUE_VIOLATION = "23505";
const codeOf = (e: unknown) => (e as { code?: unknown } | null)?.code;

/**
 * A route's catch: a unique violation (a concurrent save of the same name,
 * parameter or side; drizzle wraps the driver's error as `cause`) is a 409,
 * and no other failure ever echoes the statement drizzle puts in its message.
 */
export function conceptRouteError(error: unknown, fallback: string) {
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (
    codeOf(error) === UNIQUE_VIOLATION ||
    codeOf(cause) === UNIQUE_VIOLATION
  ) {
    return apiError(
      "CONFLICT",
      "Another concept already uses this name or parameter, or this concept changed meanwhile. Reload and try again.",
    );
  }
  return handleRouteError(error, fallback, { safeMessage: true });
}

type Session = { userId: string; role: UserRole; tenantId: string };
type UsableConnection = {
  id: string;
  type: string;
  configEncrypted: string;
};

/** The caller's usable connections in their tenant, optionally only `ids`. */
export async function usableConnections(
  session: Session,
  ids?: string[],
): Promise<UsableConnection[]> {
  return db
    .select({
      id: connections.id,
      type: connections.type,
      configEncrypted: connections.configEncrypted,
    })
    .from(connections)
    .where(
      and(
        eq(connections.tenantId, session.tenantId),
        usableConnection(session.userId, session.role),
        ids && inArray(connections.id, ids),
      ),
    );
}

// async, so a decrypt that throws rejects (and settles) instead of escaping.
const termsOf = async (c: UsableConnection) =>
  fetchConnectionTerms(
    c.type,
    decryptJson<ConnectionCredentials>(c.configEncrypted),
  );

const has = (
  live: SchemaTerm[],
  kind: string,
  key: string,
  parentKey: string,
) =>
  live.some(
    (t) => t.kind === kind && t.key === key && t.parentKey === parentKey,
  );

/**
 * Whether the caller may use every connection in `ids`: a Response when not,
 * else the connections.
 */
export async function usableOrForbidden(session: Session, ids: string[]) {
  const unique = [...new Set(ids)];
  const usable = await usableConnections(session, unique);
  if (usable.length !== unique.length) {
    return {
      response: forbidden("You cannot use every connection in this concept"),
    };
  }
  return { usable };
}

/**
 * Checks each side against its connection's live terms: the entity and the key
 * property must be there. A Response when one is not.
 */
export async function checkSidesAgainstTerms(
  sides: SideInput[],
  usable: UsableConnection[],
) {
  const terms = new Map(
    await Promise.all(
      usable.map(async (c) => [c.id, await termsOf(c)] as const),
    ),
  );
  for (const s of sides) {
    const live = terms.get(s.connectionId) ?? [];
    if (!has(live, "entity", s.entityKey, "")) {
      return badRequest(`The connection has no entity "${s.entityKey}"`);
    }
    if (
      !has(live, "property", s.keyPropertyKey, entityParentKey(s.entityKey))
    ) {
      return badRequest(
        `"${s.entityKey}" has no property "${s.keyPropertyKey}"`,
      );
    }
  }
  return undefined;
}

export interface ReadSide extends SideInput {
  /** What the connection no longer reports; null when both are there. */
  missing: "entity" | "keyProperty" | null;
}

function missingOf(s: SideInput, terms: SchemaTerm[] | undefined) {
  // Unknown structure (unreadable, or a connector that describes none) flags
  // nothing, since nothing can be said.
  if (!terms?.length) return null;
  if (!has(terms, "entity", s.entityKey, "")) return "entity";
  if (!has(terms, "property", s.keyPropertyKey, entityParentKey(s.entityKey))) {
    return "keyProperty";
  }
  return null;
}

/** Flags each side whose entity or key property is gone. Per read, never stored. */
export function flagSides(
  sides: SideInput[],
  live: Map<string, SchemaTerm[] | undefined>,
): ReadSide[] {
  return sides.map((s) => ({
    ...s,
    missing: missingOf(s, live.get(s.connectionId)),
  }));
}

/** The live terms of each connection, `undefined` where one cannot be read. */
export async function liveTermsById(usable: UsableConnection[]) {
  const settled = await Promise.allSettled(usable.map(termsOf));
  return new Map(
    usable.map((c, i) => {
      const r = settled[i];
      return [c.id, r.status === "fulfilled" ? r.value : undefined] as const;
    }),
  );
}

/** A message when the tenant already has a concept of this name or parameter. */
export async function findClash(
  tenantId: string,
  fields: { name: string; parameter: string },
  exceptId?: string,
) {
  const same = await db
    .select()
    .from(ontologyConcepts)
    .where(
      and(
        eq(ontologyConcepts.tenantId, tenantId),
        or(
          eq(ontologyConcepts.name, fields.name),
          eq(ontologyConcepts.parameter, fields.parameter),
        ),
      ),
    );
  const other = same.find((c) => c.id !== exceptId);
  if (!other) return undefined;
  return other.name === fields.name
    ? `A concept named "${fields.name}" already exists`
    : `The parameter "${fields.parameter}" is already used by another concept`;
}
