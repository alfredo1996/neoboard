import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, ontologyTerms } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { decryptJson } from "@/lib/crypto/crypto";
import { fetchConnectionTerms } from "@/lib/connector/schema-prefetch";
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { usableConnection } from "@/lib/db/connection-access";
import { apiSuccess } from "@/lib/api/api-response";
import {
  notFound,
  badRequest,
  validateBody,
  readJsonBody,
  handleRouteError,
} from "@/lib/api/api-utils";
import { mergeTerms } from "@/lib/ontology/merge";

const MAX_NAME = 200;
const MAX_DESCRIPTION = 2000;

const putSchema = z.object({
  terms: z
    .array(
      z.object({
        kind: z.enum(["entity", "relationship", "property"]),
        key: z.string().min(1).max(500),
        parentKey: z.string().max(520).default(""),
        displayName: z
          .string()
          .max(MAX_NAME, "Name is limited to 200 characters"),
        description: z
          .string()
          .max(MAX_DESCRIPTION, "Description is limited to 2,000 characters"),
        hidden: z.boolean(),
      }),
    )
    .max(1000),
});

/** The connection, if the caller's tenant holds it and the caller may use it. */
async function findUsable(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>,
) {
  const [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, id),
        eq(connections.tenantId, session.tenantId),
        usableConnection(session.userId, session.role),
      ),
    )
    .limit(1);
  return connection;
}

async function readOntology(
  connection: NonNullable<Awaited<ReturnType<typeof findUsable>>>,
  tenantId: string,
  live: Awaited<ReturnType<typeof fetchConnectionTerms>>,
) {
  const stored = await db
    .select({
      kind: ontologyTerms.kind,
      key: ontologyTerms.key,
      parentKey: ontologyTerms.parentKey,
      displayName: ontologyTerms.displayName,
      description: ontologyTerms.description,
      hidden: ontologyTerms.hidden,
    })
    .from(ontologyTerms)
    .where(
      and(
        eq(ontologyTerms.tenantId, tenantId),
        eq(ontologyTerms.connectionId, connection.id),
      ),
    );
  return { terms: mergeTerms(live, stored) };
}

function liveTerms(connection: { type: string; configEncrypted: string }) {
  return fetchConnectionTerms(
    connection.type,
    decryptJson<ConnectionCredentials>(connection.configEncrypted),
  );
}

/**
 * GET /api/connections/{id}/ontology (#2415)
 *
 * The connection's terms: the structure its connector reports, with what a
 * creator has said about each laid over it. Anyone who can use the connection
 * reads it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const connection = await findUsable(id, session);
    if (!connection) return notFound("Connection not found");
    return apiSuccess(
      await readOntology(
        connection,
        session.tenantId,
        await liveTerms(connection),
      ),
    );
  } catch (error) {
    return handleRouteError(error, "Failed to read the model");
  }
}

/**
 * PUT /api/connections/{id}/ontology
 *
 * Saves the meaning of the terms in the body: display name, description and
 * hidden. A creator or admin who can use the connection only; every key must
 * be one the connection reports now. A term with nothing said is removed, so a
 * row exists only for a term someone described or hid.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    assertCanManageConnections(session.role);
    const { id } = await params;
    const validation = validateBody(putSchema, await readJsonBody(request));
    if (!validation.success) return validation.response;

    const connection = await findUsable(id, session);
    if (!connection) return notFound("Connection not found");

    const live = await liveTerms(connection);
    const known = new Set(
      live.map((t) => JSON.stringify([t.kind, t.key, t.parentKey])),
    );
    for (const t of validation.data.terms) {
      if (!known.has(JSON.stringify([t.kind, t.key, t.parentKey]))) {
        return badRequest(`The connection has no ${t.kind} "${t.key}"`);
      }
    }

    const { tenantId } = session;
    await db.transaction(async (tx) => {
      for (const t of validation.data.terms) {
        const where = and(
          eq(ontologyTerms.tenantId, tenantId),
          eq(ontologyTerms.connectionId, connection.id),
          eq(ontologyTerms.kind, t.kind),
          eq(ontologyTerms.key, t.key),
          eq(ontologyTerms.parentKey, t.parentKey),
        );
        if (!t.displayName && !t.description && !t.hidden) {
          await tx.delete(ontologyTerms).where(where);
          continue;
        }
        const meaning = {
          displayName: t.displayName,
          description: t.description,
          hidden: t.hidden,
        };
        await tx
          .insert(ontologyTerms)
          .values({
            tenantId,
            connectionId: connection.id,
            kind: t.kind,
            key: t.key,
            parentKey: t.parentKey,
            ...meaning,
          })
          .onConflictDoUpdate({
            target: [
              ontologyTerms.tenantId,
              ontologyTerms.connectionId,
              ontologyTerms.kind,
              ontologyTerms.key,
              ontologyTerms.parentKey,
            ],
            set: { ...meaning, updatedAt: new Date() },
          });
      }
    });
    return apiSuccess(await readOntology(connection, tenantId, live));
  } catch (error) {
    return handleRouteError(error, "Failed to save the model");
  }
}
