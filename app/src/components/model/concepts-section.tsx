"use client";

import { useMemo, useState } from "react";
import { Button, EmptyState, Skeleton, Tag } from "@neoboard/components";
import { useConcepts, type Concept } from "@/hooks/use-concepts";
import {
  ConceptDialog,
  type ConceptConnection,
} from "@/components/model/concept-dialog";

export interface ConceptsSectionProps {
  /** The connections the caller can use: sides are named by them. */
  readonly connections: readonly ConceptConnection[];
  /** Creators and admins edit; readers see. */
  readonly canEdit: boolean;
  readonly search: string;
  /** Open the New concept dialog; the page header holds its button. */
  readonly newOpen: boolean;
  readonly onNewClose: () => void;
}

/** A search matches a concept's name, parameter, description or any side. */
function matches(c: Concept, q: string) {
  if (!q) return true;
  return [
    c.name,
    c.parameter,
    c.description,
    ...c.sides.flatMap((s) => [s.entityKey, s.keyPropertyKey]),
  ].some((s) => s.toLowerCase().includes(q.replace(/^\$(param_)?/, "")));
}

function groupByConnection(c: Concept) {
  const groups = new Map<string, Concept["sides"]>();
  for (const s of c.sides) {
    groups.set(s.connectionId, [...(groups.get(s.connectionId) ?? []), s]);
  }
  return [...groups];
}

/** One chart colour per connection, in the order the page lists them. */
const dotColor = (i: number) => `hsl(var(--chart-${(i % 10) + 1}))`;

function ConceptRow({
  concept,
  names,
  order,
  canEdit,
  onEdit,
}: Readonly<{
  concept: Concept;
  names: Map<string, string>;
  order: Map<string, number>;
  canEdit: boolean;
  onEdit: () => void;
}>) {
  return (
    <div className="grid items-start gap-4 border-t border-rule py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words font-semibold">{concept.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-caption font-normal text-muted-foreground">
            $param_{concept.parameter}
          </code>
        </div>
        {concept.description && (
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {concept.description}
          </p>
        )}
      </div>
      <div className="grid gap-1 text-sm">
        {groupByConnection(concept).map(([connectionId, sides]) => (
          <div
            key={connectionId}
            data-testid={`concept-side-group-${concept.id}-${connectionId}`}
            className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)] gap-3"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                aria-hidden="true"
                data-testid="connection-dot"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: dotColor(order.get(connectionId) ?? 0) }}
              />
              {names.get(connectionId) ?? connectionId}
            </span>
            <div className="grid gap-1">
              {sides.map((s) => (
                <div
                  key={`${s.entityKey}|${s.keyPropertyKey}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <code>{s.entityKey}</code>
                  <span className="text-muted-foreground">·</span>
                  <code>{s.keyPropertyKey}</code>
                  {s.missing && (
                    <Tag className="rounded-full border-warning bg-warning/10 text-warning">
                      {s.missing === "entity"
                        ? `${s.entityKey} is no longer in the database`
                        : `${s.keyPropertyKey} is no longer on ${s.entityKey}`}
                    </Tag>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {concept.sides.length > 1 && (
          <p className="m-0 text-meta text-muted-foreground">
            Values must match exactly on every side.
          </p>
        )}
      </div>
      <div>
        {canEdit && (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Edit ${concept.name}`}
            onClick={onEdit}
          >
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The Concepts section at the top of the Model page (#2484): each concept with
 * its sides grouped by connection. Creators and admins add and edit; readers
 * only read.
 */
export function ConceptsSection({
  connections,
  canEdit,
  search,
  newOpen,
  onNewClose,
}: ConceptsSectionProps) {
  const { data, isLoading, isError } = useConcepts();
  const [editing, setEditing] = useState<Concept | null>(null);
  const names = useMemo(
    () => new Map(connections.map((c) => [c.id, c.name])),
    [connections],
  );
  const order = useMemo(
    () => new Map(connections.map((c, i) => [c.id, i])),
    [connections],
  );
  const q = search.trim().toLowerCase();
  const shown = (data ?? []).filter((c) => matches(c, q));

  let body;
  if (isLoading) {
    body = (
      <output aria-label="Loading concepts" className="grid gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </output>
    );
  } else if (isError) {
    body = <p role="alert">Could not load the concepts.</p>;
  } else if (data?.length === 0) {
    body = (
      <EmptyState
        title="No concepts yet"
        description="A concept links the same thing across connections by a key both hold."
      />
    );
  } else if (shown.length === 0) {
    body = <p className="text-sm text-muted-foreground">No concepts match.</p>;
  } else {
    body = shown.map((c) => (
      <ConceptRow
        key={c.id}
        concept={c}
        names={names}
        order={order}
        canEdit={canEdit}
        onEdit={() => setEditing(c)}
      />
    ));
  }

  return (
    <section aria-labelledby="model-concepts">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="model-concepts" className="m-0 text-section">
            Concepts
          </h2>
          <p className="mt-1 max-w-xl text-meta text-muted-foreground">
            A concept links the same thing across connections by a key both
            hold. A click or a filter that sets the concept&apos;s parameter
            reaches widgets on every connection mapped here.
          </p>
        </div>
      </div>
      {body}
      <ConceptDialog
        open={newOpen || editing !== null}
        onOpenChange={(o) => {
          if (o) return;
          setEditing(null);
          onNewClose();
        }}
        concept={editing ?? undefined}
        connections={connections}
      />
    </section>
  );
}
