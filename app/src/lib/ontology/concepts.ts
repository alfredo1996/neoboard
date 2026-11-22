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
const FOREIGN_KEY_VIOLATION = "23503";
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
  // A connection or concept deleted while this wrote: its side no longer fits.
  if (
    codeOf(error) === FOREIGN_KEY_VIOLATION ||
    codeOf(cause) === FOREIGN_KEY_VIOLATION
  ) {
    return apiError(
      "CONFLICT",
      "A connection or concept used here was deleted meanwhile. Reload and try again.",
    );
  }
  return handleRouteError(error, fallback, { safeMessage: true });
}

type Session = { userId: string; role: UserRole; tenantId: string };
type UsableConnection = {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  configEncrypted: string;
};

const usableWhere = (session: Session, ids?: string[]) =>
  and(
    eq(connections.tenantId, session.tenantId),
    usableConnection(session.userId, session.role),
    ids && inArray(connections.id, ids),
  );

/** The caller's usable connections in their tenant, optionally only `ids`. */
export function usableConnections(
  session: Session,
  ids?: string[],
): Promise<UsableConnection[]> {
  return db
    .select({
      id: connections.id,
      tenantId: connections.tenantId,
      name: connections.name,
      type: connections.type,
      configEncrypted: connections.configEncrypted,
    })
    .from(connections)
    .where(usableWhere(session, ids));
}

/**
 * The same, as ids and names only: for a caller that decrypts nothing, so the
 * stored configs are not loaded for it (#2534).
 */
export function usableConnectionNames(
  session: Session,
): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: connections.id, name: connections.name })
    .from(connections)
    .where(usableWhere(session));
}

// async, so a decrypt that throws rejects (and settles) instead of escaping.
const termsOf = async (c: UsableConnection, refresh = false) =>
  fetchConnectionTerms(
    c.type,
    decryptJson<ConnectionCredentials>(c.configEncrypted),
    {
      tenantId: c.tenantId,
      connectionId: c.id,
      configEncrypted: c.configEncrypted,
      refresh,
    },
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
export async function usableOrForbidden(
  session: Session,
  ids: string[],
  message = "You cannot use every connection in this concept",
) {
  const unique = [...new Set(ids)];
  const usable = await usableConnections(session, unique);
  if (usable.length !== unique.length) {
    return {
      response: forbidden(message),
    };
  }
  return { usable };
}

const badSide = (sides: SideInput[], terms: Map<string, SchemaTerm[]>) => {
  for (const s of sides) {
    const live = terms.get(s.connectionId) ?? [];
    if (!has(live, "entity", s.entityKey, "")) {
      return `The connection has no entity "${s.entityKey}"`;
    }
    if (
      !has(live, "property", s.keyPropertyKey, entityParentKey(s.entityKey))
    ) {
      return `"${s.entityKey}" has no property "${s.keyPropertyKey}"`;
    }
  }
  return undefined;
};

/**
 * Checks each side against its connection's live terms: the entity and the key
 * property must be there. A Response when one is not. The cached read answers
 * first; a side it refuses may be new in the database, so the connections are
 * read once more, past the cache, before it is refused (#2514).
 */
export async function checkSidesAgainstTerms(
  sides: SideInput[],
  usable: UsableConnection[],
) {
  const read = async (from: UsableConnection[], refresh: boolean) =>
    new Map(
      await Promise.all(
        from.map(async (c) => [c.id, await termsOf(c, refresh)] as const),
      ),
    );
  const cached = await read(usable, false);
  // Only a connection with a refused side is read again (#2534).
  const refused = new Set(
    sides.filter((s) => badSide([s], cached)).map((s) => s.connectionId),
  );
  if (refused.size === 0) return undefined;
  const fresh = await read(
    usable.filter((c) => refused.has(c.id)),
    true,
  );
  const bad = badSide(sides, new Map([...cached, ...fresh]));
  return bad ? badRequest(bad) : undefined;
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
  const settled = await Promise.allSettled(usable.map((c) => termsOf(c)));
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
