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
  liveTermsById,
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

export interface PreviewItem {
  kind: "term" | "concept";
  label: string;
  status: "new" | "changed";
  orphaned: boolean;
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
    skipped: number;
    skippedSides: number;
  };
  items: PreviewItem[];
}

const termId = (c: string, kind: string, key: string, parent: string) =>
  JSON.stringify([c, kind, key, parent]);
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

/**
 * What importing `file` would do, with `mapping` (file connection id to local
 * connection id; absent or empty means skipped). Reads only; the caller writes
 * `termRows` and `conceptWrites` when applying.
 */
export async function planImport(
  h: Handle,
  tenantId: string,
  file: OntologyFile,
  mapping: Record<string, string>,
  usable: Parameters<typeof liveTermsById>[0],
) {
  const target = (fileId: string) => mapping[fileId] || undefined;
  const targets = [...new Set(Object.values(mapping).filter(Boolean))];
  const live = await liveTermsById(usable);
  const items: PreviewItem[] = [];
  const preview: ImportPreview = {
    terms: { new: 0, changed: 0, unchanged: 0, orphaned: 0, skipped: 0 },
    concepts: {
      new: 0,
      changed: 0,
      unchanged: 0,
      orphaned: 0,
      skipped: 0,
      skippedSides: 0,
    },
    items,
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

  // Terms
  const existing = new Map(
    storedTerms.map((t) => [
      termId(t.connectionId, t.kind, t.key, t.parentKey),
      t,
    ]),
  );
  const termRows: TermRow[] = [];
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
    const liveTerms = live.get(to);
    for (const t of said) {
      const old = existing.get(termId(to, t.kind, t.key, t.parentKey));
      const orphaned =
        !!liveTerms?.length &&
        !liveTerms.some(
          (l: SchemaTerm) =>
            l.kind === t.kind && l.key === t.key && l.parentKey === t.parentKey,
        );
      if (
        old &&
        old.displayName === t.displayName &&
        old.description === t.description &&
        old.hidden === t.hidden
      ) {
        preview.terms.unchanged++;
        continue;
      }
      const status = old ? "changed" : "new";
      preview.terms[status]++;
      if (orphaned) preview.terms.orphaned++;
      items.push({
        kind: "term",
        label: `${c.name}: ${t.kind} ${t.key}`,
        status,
        orphaned,
      });
      termRows.push({ tenantId, connectionId: to, ...t });
    }
  }

  // Concepts
  const conceptWrites: ConceptWrite[] = [];
  const taken = new Set<string>();
  for (const c of file.concepts) {
    const mapped = new Map<string, SideInput>();
    for (const s of c.sides) {
      const to = file.connections.some((x) => x.id === s.connectionId)
        ? target(s.connectionId)
        : undefined;
      if (to)
        mapped.set(sideId({ ...s, connectionId: to }), {
          ...s,
          connectionId: to,
        });
    }
    preview.concepts.skippedSides += c.sides.length - mapped.size;
    const byName = concepts.find((x) => x.name === c.name);
    const byParam = concepts.find((x) => x.parameter === c.parameter);
    const old = byName ?? byParam;
    const conflict = byName && byParam && byName.id !== byParam.id;
    if (!mapped.size || conflict || (old && taken.has(old.id))) {
      preview.concepts.skipped++;
      continue;
    }
    if (old) taken.add(old.id);
    const have = new Set(
      sides.filter((s) => s.conceptId === old?.id).map(sideId),
    );
    const added = [...mapped.values()].filter((s) => !have.has(sideId(s)));
    const same =
      old &&
      old.name === c.name &&
      old.parameter === c.parameter &&
      old.description === c.description;
    if (old && same && !added.length) {
      preview.concepts.unchanged++;
      continue;
    }
    const status = old ? "changed" : "new";
    const orphaned = flagSides([...mapped.values()], live).some(
      (s) => s.missing,
    );
    preview.concepts[status]++;
    if (orphaned) preview.concepts.orphaned++;
    items.push({ kind: "concept", label: c.name, status, orphaned });
    conceptWrites.push({
      existingId: old?.id,
      name: c.name,
      parameter: c.parameter,
      description: c.description,
      sides: added,
    });
  }
  return { preview, termRows, conceptWrites };
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
  for (let i = 0; i < plan.termRows.length; i += CHUNK) {
    await tx
      .insert(ontologyTerms)
      .values(
        plan.termRows.slice(i, i + CHUNK).map((r) => ({ ...r, tenantId })),
      )
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
  for (const c of plan.conceptWrites) {
    const { existingId, sides, ...fields } = c;
    let id = existingId;
    if (id) {
      await tx
        .update(ontologyConcepts)
        .set(fields)
        .where(
          and(
            eq(ontologyConcepts.tenantId, tenantId),
            eq(ontologyConcepts.id, id),
          ),
        );
    } else {
      id = randomId();
      await tx.insert(ontologyConcepts).values({ id, tenantId, ...fields });
    }
    if (sides.length) {
      await tx
        .insert(ontologyConceptSides)
        .values(sides.map((s) => ({ tenantId, conceptId: id, ...s })))
        .onConflictDoNothing();
    }
  }
}
