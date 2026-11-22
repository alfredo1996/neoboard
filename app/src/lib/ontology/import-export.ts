import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ontologyConcepts,
  ontologyConceptSides,
  ontologyTerms,
} from "@/lib/db/schema";
import { randomId } from "@/lib/random-id";
import {
  MAX_DESCRIPTION,
  MAX_NAME,
  conceptFields,
  flagSides,
  sideSchema,
  type SideInput,
} from "@/lib/ontology/concepts";
import type { SchemaTerm } from "@neoboard/connection";

export const ONTOLOGY_FORMAT = "neoboard-ontology";
export const ONTOLOGY_VERSION = 1;

const termSchema = z.object({
  kind: z.enum(["entity", "relationship", "property"]),
  key: z.string().min(1).max(500),
  parentKey: z.string().max(520).default(""),
  displayName: z
    .string()
    .max(MAX_NAME, "Name is limited to 200 characters")
    .default(""),
  description: z
    .string()
    .max(MAX_DESCRIPTION, "Description is limited to 2,000 characters")
    .default(""),
  hidden: z.boolean().default(false),
});

const termId = (c: string, kind: string, key: string, parent: string) =>
  JSON.stringify([c, kind, key, parent]);

const fileSchema = z
  .object({
    format: z.literal(ONTOLOGY_FORMAT),
    version: z.number().int().min(1).max(ONTOLOGY_VERSION),
    connections: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          name: z.string().max(MAX_NAME),
          terms: z.array(termSchema).max(20000),
        }),
      )
      .max(500),
    concepts: z
      .array(z.object({ ...conceptFields, sides: sideSchema.array().max(50) }))
      .max(2000),
  })
  .superRefine((f, ctx) => {
    const dup = (xs: string[]) => new Set(xs).size !== xs.length;
    if (dup(f.connections.map((c) => c.id)))
      ctx.addIssue({ code: "custom", message: "Two connections share an id" });
    for (const c of f.connections) {
      if (dup(c.terms.map((t) => termId("", t.kind, t.key, t.parentKey)))) {
        ctx.addIssue({
          code: "custom",
          message: `Connection "${c.name || c.id}" repeats a term`,
        });
      }
    }
    if (
      dup(f.concepts.map((c) => c.name)) ||
      dup(f.concepts.map((c) => c.parameter))
    )
      ctx.addIssue({
        code: "custom",
        message: "Two concepts share a name or a parameter",
      });
  });
export type OntologyFile = z.infer<typeof fileSchema>;

/** The file, or the reason it is refused (unknown format, newer version, bad field). */
export function parseOntologyFile(
  payload: unknown,
): { file: OntologyFile } | { error: string } {
  const head = z
    .object({ format: z.unknown(), version: z.unknown() })
    .safeParse(payload);
  if (!head.success || head.data.format !== ONTOLOGY_FORMAT) {
    return {
      error: `Not a NeoBoard ontology file: its format must be "${ONTOLOGY_FORMAT}"`,
    };
  }
  const v = head.data.version;
  if (typeof v === "number" && v > ONTOLOGY_VERSION) {
    return {
      error: `This file is a newer version (${v}) than this install reads (${ONTOLOGY_VERSION}). Update NeoBoard to import it.`,
    };
  }
  const parsed = fileSchema.safeParse(payload);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return {
      error: `${i?.path.join(".") || "File"}: ${i?.message ?? "invalid"}`,
    };
  }
  return { file: parsed.data };
}

type Handle = Pick<typeof db, "select" | "insert" | "update">;
type Live = Map<string, SchemaTerm[] | undefined>;

export interface PreviewItem {
  /** Unique within a preview: the target connection, kind, key and parent key. */
  id: string;
  kind: "term" | "concept";
  label: string;
  status: "new" | "changed";
  orphaned: boolean;
}

/** Something the import leaves out, named from the file's own data only. */
export interface SkippedItem {
  kind: "concept" | "side";
  label: string;
}

export interface ImportPreview {
  terms: {
    new: number;
    changed: number;
    unchanged: number;
    orphaned: number;
    skipped: number;
  };
  concepts: {
    new: number;
    changed: number;
    unchanged: number;
    orphaned: number;
    /** Concepts left out whole; their sides are not counted again. */
    skipped: number;
    /** Sides left out of a concept that is imported. */
    skippedSides: number;
  };
  items: PreviewItem[];
  skipped: SkippedItem[];
}

const sideId = (s: SideInput) =>
  JSON.stringify([s.connectionId, s.entityKey, s.keyPropertyKey]);

type TermRow = typeof ontologyTerms.$inferInsert;
type ConceptWrite = {
  existingId?: string;
  name: string;
  parameter: string;
  description: string;
  sides: SideInput[];
};
type Target = (fileConnectionId: string) => string | undefined;
type Plan = {
  preview: ImportPreview;
  termRows: TermRow[];
  conceptWrites: ConceptWrite[];
};

/** `Person.name` for a property of entity `Person`; the key alone for an entity. */
const termName = (t: { key: string; parentKey: string }) =>
  t.parentKey
    ? `${t.parentKey.slice(t.parentKey.indexOf(":") + 1)}.${t.key}`
    : t.key;

const sameTerm = (
  old: { displayName: string; description: string; hidden: boolean },
  t: { displayName: string; description: string; hidden: boolean },
) =>
  old.displayName === t.displayName &&
  old.description === t.description &&
  old.hidden === t.hidden;

function planTerms(
  file: OntologyFile,
  target: Target,
  stored: (typeof ontologyTerms.$inferSelect)[],
  live: Live,
  tenantId: string,
  plan: Plan,
) {
  const { preview } = plan;
  const existing = new Map(
    stored.map((t) => [termId(t.connectionId, t.kind, t.key, t.parentKey), t]),
  );
  // One entry per target term, the last in the file winning: the metadata database refuses
  // an upsert that names a row twice (two file connections mapped to one).
  const wanted = new Map<
    string,
    { to: string; from: string; t: OntologyFile["connections"][0]["terms"][0] }
  >();
  for (const c of file.connections) {
    // A term with nothing said carries no meaning, so it neither writes nor erases.
    const said = c.terms.filter(
      (t) => t.displayName || t.description || t.hidden,
    );
    const to = target(c.id);
    if (!to) {
      preview.terms.skipped += said.length;
      continue;
    }
    for (const t of said) {
      wanted.set(termId(to, t.kind, t.key, t.parentKey), {
        to,
        from: c.name,
        t,
      });
    }
  }
  for (const [id, { to, from, t }] of wanted) {
    const old = existing.get(id);
    if (old && sameTerm(old, t)) {
      preview.terms.unchanged++;
      continue;
    }
    const liveTerms = live.get(to);
    const orphaned =
      !!liveTerms?.length &&
      !liveTerms.some(
        (l) =>
          l.kind === t.kind && l.key === t.key && l.parentKey === t.parentKey,
      );
    const status = old ? "changed" : "new";
    preview.terms[status]++;
    if (orphaned) preview.terms.orphaned++;
    preview.items.push({
      id,
      kind: "term",
      label: `${from}: ${t.kind} ${termName(t)}`,
      status,
      orphaned,
    });
    plan.termRows.push({ tenantId, connectionId: to, ...t });
  }
}

/** The concept's sides on connections that are mapped; the rest, named for the preview. */
function mapSides(
  c: OntologyFile["concepts"][0],
  file: OntologyFile,
  target: Target,
) {
  const mapped = new Map<string, SideInput>();
  const dropped: SkippedItem[] = [];
  for (const s of c.sides) {
    const from = file.connections.find((x) => x.id === s.connectionId);
    const to = from ? target(s.connectionId) : undefined;
    if (to) {
      mapped.set(sideId({ ...s, connectionId: to }), {
        ...s,
        connectionId: to,
      });
    } else {
      dropped.push({
        kind: "side",
        label: `${c.name}: ${s.entityKey}.${s.keyPropertyKey} on ${from?.name || s.connectionId}`,
      });
    }
  }
  return { mapped, dropped };
}

type StoredConcept = typeof ontologyConcepts.$inferSelect;

/** Counts and queues one imported concept: new, changed, or already as the file has it. */
function addConcept(
  plan: Plan,
  c: OntologyFile["concepts"][0],
  old: StoredConcept | undefined,
  mapped: Map<string, SideInput>,
  sides: (typeof ontologyConceptSides.$inferSelect)[],
  live: Live,
) {
  const { preview } = plan;
  const have = new Set(
    sides.filter((s) => s.conceptId === old?.id).map(sideId),
  );
  const added = [...mapped.values()].filter((s) => !have.has(sideId(s)));
  const same =
    old?.name === c.name &&
    old.parameter === c.parameter &&
    old.description === c.description;
  if (same && !added.length) {
    preview.concepts.unchanged++;
    return;
  }
  const status = old ? "changed" : "new";
  const orphaned = flagSides([...mapped.values()], live).some((s) => s.missing);
  preview.concepts[status]++;
  if (orphaned) preview.concepts.orphaned++;
  preview.items.push({
    id: JSON.stringify(["concept", c.name]),
    kind: "concept",
    label: c.name,
    status,
    orphaned,
  });
  plan.conceptWrites.push({
    existingId: old?.id,
    name: c.name,
    parameter: c.parameter,
    description: c.description,
    sides: added,
  });
}

function planConcepts(
  file: OntologyFile,
  target: Target,
  concepts: StoredConcept[],
  sides: (typeof ontologyConceptSides.$inferSelect)[],
  live: Live,
  visibleTo: ReadonlySet<string> | undefined,
  plan: Plan,
) {
  const { preview } = plan;
  // A concept the creator sees has a side on a connection they can use.
  const visible = (x: StoredConcept | undefined) =>
    !x ||
    !visibleTo ||
    sides.some((s) => s.conceptId === x.id && visibleTo.has(s.connectionId));
  const taken = new Set<string>();
  for (const c of file.concepts) {
    const { mapped, dropped } = mapSides(c, file, target);
    const byName = concepts.find((x) => x.name === c.name);
    const byParam = concepts.find((x) => x.parameter === c.parameter);
    const old = byName ?? byParam;
    // Name and parameter naming two concepts, or a match the creator cannot
    // see, skips like any other, naming nothing.
    const blocked =
      (byName && byParam && byName.id !== byParam.id) ||
      !visible(byName) ||
      !visible(byParam);
    if (!mapped.size || blocked || (old && taken.has(old.id))) {
      preview.concepts.skipped++;
      preview.skipped.push({ kind: "concept", label: c.name });
      continue;
    }
    preview.concepts.skippedSides += dropped.length;
    preview.skipped.push(...dropped);
    if (old) taken.add(old.id);
    addConcept(plan, c, old, mapped, sides, live);
  }
}

/**
 * What importing `file` would do, with `mapping` (file connection id to local
 * connection id; absent or empty means skipped) and the `live` terms of the
 * mapped connections. `visibleTo` is the caller's every usable connection, or
 * undefined for an admin: a concept with no side there is not theirs to match.
 * Reads only the database; the caller writes `termRows` and `conceptWrites`.
 */
export async function planImport(
  h: Handle,
  tenantId: string,
  file: OntologyFile,
  mapping: Record<string, string>,
  live: Live,
  visibleTo?: ReadonlySet<string>,
): Promise<Plan> {
  const target: Target = (id) =>
    Object.hasOwn(mapping, id) ? mapping[id] || undefined : undefined;
  const targets = [...new Set(Object.values(mapping).filter(Boolean))];
  const plan: Plan = {
    termRows: [],
    conceptWrites: [],
    preview: {
      terms: { new: 0, changed: 0, unchanged: 0, orphaned: 0, skipped: 0 },
      concepts: {
        new: 0,
        changed: 0,
        unchanged: 0,
        orphaned: 0,
        skipped: 0,
        skippedSides: 0,
      },
      items: [],
      skipped: [],
    },
  };
  const [storedTerms, concepts, sides] = await Promise.all([
    targets.length
      ? h
          .select()
          .from(ontologyTerms)
          .where(
            and(
              eq(ontologyTerms.tenantId, tenantId),
              inArray(ontologyTerms.connectionId, targets),
            ),
          )
      : Promise.resolve([]),
    h
      .select()
      .from(ontologyConcepts)
      .where(eq(ontologyConcepts.tenantId, tenantId)),
    h
      .select()
      .from(ontologyConceptSides)
      .where(eq(ontologyConceptSides.tenantId, tenantId)),
  ]);
  planTerms(file, target, storedTerms, live, tenantId, plan);
  planConcepts(file, target, concepts, sides, live, visibleTo, plan);
  return plan;
}

const CHUNK = 1000;

/** Writes a plan on `tx`: the file wins for what it holds; nothing is deleted. */
export async function writePlan(
  tx: Handle,
  tenantId: string,
  plan: Pick<
    Awaited<ReturnType<typeof planImport>>,
    "termRows" | "conceptWrites"
  >,
) {
  const chunks: (typeof plan.termRows)[] = [];
  for (let i = 0; i < plan.termRows.length; i += CHUNK) {
    chunks.push(plan.termRows.slice(i, i + CHUNK));
  }
  // ponytail: one transaction client runs these one at a time anyway; the
  // first failure rejects and the transaction rolls back, as in #2512.
  await Promise.all([
    ...chunks.map((rows) => upsertTerms(tx, tenantId, rows)),
    writeConcepts(tx, tenantId, plan.conceptWrites),
  ]);
}

function upsertTerms(tx: Handle, tenantId: string, rows: TermRow[]) {
  return tx
    .insert(ontologyTerms)
    .values(rows.map((r) => ({ ...r, tenantId })))
    .onConflictDoUpdate({
      target: [
        ontologyTerms.tenantId,
        ontologyTerms.connectionId,
        ontologyTerms.kind,
        ontologyTerms.key,
        ontologyTerms.parentKey,
      ],
      set: {
        displayName: sql`excluded.display_name`,
        description: sql`excluded.description`,
        hidden: sql`excluded.hidden`,
        updatedAt: new Date(),
      },
    });
}

const chunked = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) =>
    items.slice(i * CHUNK, (i + 1) * CHUNK),
  );

/**
 * The concepts: new ones in one insert, an existing one updated by its id,
 * then every side in one more, since they reference the concepts (#2534).
 */
async function writeConcepts(
  tx: Handle,
  tenantId: string,
  writes: ConceptWrite[],
) {
  const all = writes.map(({ existingId, sides, ...fields }) => ({
    id: existingId ?? randomId(),
    isNew: !existingId,
    sides,
    fields,
  }));
  const created = all
    .filter((c) => c.isNew)
    .map((c) => ({ id: c.id, ...c.fields }));
  for (const rows of chunked(created)) {
    await tx
      .insert(ontologyConcepts)
      .values(rows.map((c) => ({ ...c, tenantId })));
  }
  await Promise.all(
    all
      .filter((c) => !c.isNew)
      .map((c) =>
        tx
          .update(ontologyConcepts)
          .set(c.fields)
          .where(
            and(
              eq(ontologyConcepts.tenantId, tenantId),
              eq(ontologyConcepts.id, c.id),
            ),
          ),
      ),
  );
  const sides = all.flatMap((c) =>
    c.sides.map((s) => ({ conceptId: c.id, ...s })),
  );
  for (const rows of chunked(sides)) {
    await tx
      .insert(ontologyConceptSides)
      .values(rows.map((s) => ({ ...s, tenantId })))
      .onConflictDoNothing();
  }
}
