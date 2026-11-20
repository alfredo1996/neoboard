"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button,
  Input,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@neoboard/components";
import { useOntology, useSaveTerms } from "@/hooks/use-ontology";
import { groupTerms } from "@/lib/ontology/group";
import type { OntologyTerm } from "@/lib/ontology/merge";

const KIND_WORD: Record<string, string> = {
  entity: "Entity",
  relationship: "Relationship",
};

function countOf(terms: OntologyTerm[], kind: string) {
  return terms.filter((t) => t.kind === kind && !t.orphaned).length;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

interface TermRowProps {
  readonly term: OntologyTerm;
  readonly canEdit: boolean;
  readonly nested: boolean;
  readonly onSave: (term: OntologyTerm, changes: Partial<OntologyTerm>) => void;
  readonly onRemove: (term: OntologyTerm) => void;
}

/** A property is named with its parent, since property names repeat. */
function nameOf(term: OntologyTerm) {
  const parent = term.parentKey.slice(term.parentKey.indexOf(":") + 1);
  return term.kind === "property" && parent
    ? `${parent}.${term.key}`
    : term.key;
}

const side = (table: string, columns?: string[]) =>
  columns ? `${table}(${columns.join(", ")})` : table;

function TermRow({ term, canEdit, nested, onSave, onRemove }: TermRowProps) {
  const name = nameOf(term);
  // Orphaned terms are no longer in the connection: the server takes no edit
  // for them, only their removal.
  const editable = canEdit && !term.orphaned;
  const isProperty = term.kind === "property";
  return (
    <TableRow className={term.hidden ? "text-muted-foreground" : undefined}>
      <TableCell className={nested ? "pl-8" : "pt-3 font-semibold"}>
        <code className={term.orphaned ? "line-through" : undefined}>
          {term.key}
        </code>
        {term.primaryKey && <Tag className="ml-2">Key</Tag>}
        {term.orphaned && (
          <Tag className="ml-2 rounded-full border-warning bg-warning/10 text-warning">
            Orphaned
          </Tag>
        )}
        {term.hidden && <Tag className="ml-2">Hidden</Tag>}
      </TableCell>
      <TableCell>
        {editable ? (
          <Input
            // A new key resets the field once the saved value comes back.
            key={term.displayName}
            aria-label={`Display name of ${name}`}
            inPlace
            placeholder="Add a name"
            maxLength={200}
            defaultValue={term.displayName}
            onBlur={(e) =>
              e.target.value !== term.displayName &&
              onSave(term, { displayName: e.target.value })
            }
          />
        ) : (
          <span>{term.displayName}</span>
        )}
      </TableCell>
      <TableCell>
        {editable ? (
          <Input
            key={term.description}
            aria-label={`Description of ${name}`}
            inPlace
            placeholder="Add a description"
            maxLength={2000}
            defaultValue={term.description}
            onBlur={(e) =>
              e.target.value !== term.description &&
              onSave(term, { description: e.target.value })
            }
          />
        ) : (
          <span>{term.description}</span>
        )}
      </TableCell>
      <TableCell className="text-caption text-foreground-2">
        {isProperty ? (
          term.type
        ) : (
          <>
            <Tag>{KIND_WORD[term.kind] ?? term.kind}</Tag>
            {term.joins?.map((j) => (
              <div key={`${j.from}>${j.to}`}>
                {side(j.from, j.fromColumns)} → {side(j.to, j.toColumns)}
              </div>
            ))}
          </>
        )}
      </TableCell>
      <TableCell>
        {canEdit && term.orphaned ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove ${name}`}
            onClick={() => onRemove(term)}
          >
            Remove
          </Button>
        ) : (
          <Switch
            aria-label={`Hide ${name}`}
            checked={term.hidden}
            disabled={!editable}
            onCheckedChange={(hidden) => onSave(term, { hidden })}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

export interface ConnectionTermsProps {
  readonly connectionId: string;
  readonly name: string;
  /** Creators and admins edit; readers see. */
  readonly canEdit: boolean;
  readonly search: string;
}

/** One connection's terms on the Model page (#2415). */
export function ConnectionTerms({
  connectionId,
  name,
  canEdit,
  search,
}: ConnectionTermsProps) {
  const { data, isLoading, isError, isFetching, refetch } =
    useOntology(connectionId);
  const save = useSaveTerms(connectionId);
  const [showHidden, setShowHidden] = useState(false);
  const terms = data?.terms;
  const groups = useMemo(
    () => groupTerms(terms ?? [], search, showHidden),
    [terms, search, showHidden],
  );

  // Only the changed field is sent: props may be stale when a second save
  // follows a first, and a whole term would put the old value back.
  function onSave(term: OntologyTerm, changes: Partial<OntologyTerm>) {
    const { kind, key, parentKey } = term;
    const { displayName, description, hidden } = changes;
    save.mutate([
      {
        kind,
        key,
        parentKey,
        ...(displayName !== undefined && { displayName }),
        ...(description !== undefined && { description }),
        ...(hidden !== undefined && { hidden }),
      },
    ]);
  }

  function onRemove({ kind, key, parentKey }: OntologyTerm) {
    save.mutate([{ kind, key, parentKey, remove: true }]);
  }

  let body;
  if (isLoading) {
    body = (
      <output aria-label="Loading terms" className="grid gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </output>
    );
  } else if (isError) {
    body = (
      <div role="alert" className="flex items-center gap-3 text-sm">
        <span>Could not read this connection&apos;s structure.</span>
        <Button size="sm" variant="secondary" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (terms?.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        This connection doesn&apos;t describe its structure.
      </p>
    );
  } else if (groups.length === 0) {
    body = <p className="text-sm text-muted-foreground">No terms match.</p>;
  } else {
    body = (
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[24%]">Term</TableHead>
            <TableHead className="w-[20%]">Display name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[18%]">Type</TableHead>
            <TableHead className="w-16">Hidden</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.flatMap((g) => [
            <TermRow
              key={`${g.head.kind}|${g.head.key}|${g.head.parentKey}`}
              term={g.head}
              canEdit={canEdit}
              nested={false}
              onSave={onSave}
              onRemove={onRemove}
            />,
            ...g.properties.map((p) => (
              <TermRow
                key={`${p.kind}|${p.key}|${p.parentKey}`}
                term={p}
                canEdit={canEdit}
                nested
                onSave={onSave}
                onRemove={onRemove}
              />
            )),
          ])}
        </TableBody>
      </Table>
    );
  }

  const headingId = `model-${connectionId}`;
  return (
    <section
      id={`connection-${connectionId}`}
      aria-labelledby={headingId}
      className="border-t border-rule pt-5"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="m-0 text-section">
            {name}
          </h2>
          {terms && terms.length > 0 && (
            <p className="mt-1 text-meta text-muted-foreground">
              {plural(countOf(terms, "entity"), "entity", "entities")} ·{" "}
              {plural(
                countOf(terms, "relationship"),
                "relationship",
                "relationships",
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              aria-label={`Show hidden terms of ${name}`}
              checked={showHidden}
              onCheckedChange={setShowHidden}
            />
            Show hidden
          </label>
          <Button
            size="sm"
            variant="ghost"
            className="gap-2"
            disabled={isFetching}
            aria-label={`Refresh the structure of ${name}`}
            onClick={() => refetch()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">{body}</div>
    </section>
  );
}
