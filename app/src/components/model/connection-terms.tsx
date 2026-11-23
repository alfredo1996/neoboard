"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
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
import {
  useOntology,
  useRefreshOntology,
  useSaveTerms,
} from "@/hooks/use-ontology";
import { useConcepts } from "@/hooks/use-concepts";
import { entityParentKey } from "@/lib/ontology/term-keys";
import { buildGroups, filterGroups } from "@/lib/ontology/group";
import type { OntologyTerm } from "@/lib/ontology/merge";

const KIND_WORD: Record<string, string> = {
  entity: "Entity",
  relationship: "Relationship",
};

function countOf(terms: OntologyTerm[], kind: string) {
  return terms.filter((t) => t.kind === kind && !t.orphaned).length;
}

/** More matches than this are listed closed, so a broad search stays light. */
const OPEN_LIMIT = 20;
/** Stands for the section itself among the ids a search closed. */
const SECTION = "section";
const NONE: ReadonlySet<string> = new Set();

const idOf = (t: OntologyTerm) => `${t.kind}|${t.key}|${t.parentKey}`;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

interface TermRowProps {
  readonly term: OntologyTerm;
  readonly canEdit: boolean;
  readonly nested: boolean;
  /** An entity or relationship with properties: the chevron that opens them. */
  readonly toggle?: {
    readonly open: boolean;
    readonly count: number;
    readonly onToggle: () => void;
  };
  /** The concepts this property is the key of, on this connection. */
  readonly conceptKeys?: readonly string[];
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

function TermRow({
  term,
  canEdit,
  nested,
  toggle,
  conceptKeys,
  onSave,
  onRemove,
}: TermRowProps) {
  const name = nameOf(term);
  // Orphaned terms are no longer in the connection: the server takes no edit
  // for them, only their removal.
  const editable = canEdit && !term.orphaned;
  const isProperty = term.kind === "property";
  return (
    <TableRow className={term.hidden ? "text-muted-foreground" : undefined}>
      <TableCell className={nested ? "pl-8" : "pt-3 font-semibold"}>
        {toggle && (
          <button
            type="button"
            aria-expanded={toggle.open}
            aria-label={`${toggle.open ? "Hide" : "Show"} the properties of ${name}`}
            onClick={toggle.onToggle}
            className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-sm align-middle text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${toggle.open ? "rotate-90" : ""}`}
              aria-hidden
            />
          </button>
        )}
        {!nested && !toggle && <span className="mr-1 inline-block w-5" />}
        <code className={term.orphaned ? "line-through" : undefined}>
          {term.key}
        </code>
        {toggle && (
          <span className="ml-2 text-meta font-normal text-muted-foreground">
            {toggle.count}
          </span>
        )}
        {term.primaryKey && <Tag className="ml-2">Key</Tag>}
        {conceptKeys?.map((name) => (
          <Tag key={name} className="ml-2">
            {name} key
          </Tag>
        ))}
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
  /** Starts open: the tenant's only connection. */
  readonly defaultOpen?: boolean;
  /** Opens and scrolls to the section: a `#connection-<id>` link points here. */
  readonly forceOpen?: boolean;
}

/**
 * One connection's terms on the Model page (#2415). The section starts closed
 * and reads its structure only once it is open or a search needs it; an entity
 * mounts its properties only while it is open (#2533).
 */
export function ConnectionTerms({
  connectionId,
  name,
  canEdit,
  search,
  defaultOpen = false,
  forceOpen = false,
}: ConnectionTermsProps) {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const searching = search.trim() !== "";
  const { data, isLoading, isError, isFetching, refetch } = useOntology(
    connectionId,
    { enabled: open || searching },
  );
  const refresh = useRefreshOntology(connectionId);
  const save = useSaveTerms(connectionId);
  const { data: concepts } = useConcepts();
  const sectionRef = useRef<HTMLElement>(null);
  // A link that arrives later opens the section once; the user can still close it.
  const [linked, setLinked] = useState(forceOpen);
  if (forceOpen !== linked) {
    setLinked(forceOpen);
    if (forceOpen) setOpen(true);
  }
  useEffect(() => {
    if (!forceOpen) return;
    sectionRef.current?.scrollIntoView?.({ block: "start" });
  }, [forceOpen]);
  // Concept names by the property that keys them here, for the "<Concept> key" tag.
  const conceptKeys = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const c of concepts ?? []) {
      for (const s of c.sides) {
        if (s.connectionId !== connectionId) continue;
        const k = `${entityParentKey(s.entityKey)}|${s.keyPropertyKey}`;
        byKey.set(k, [...(byKey.get(k) ?? []), c.name]);
      }
    }
    return byKey;
  }, [concepts, connectionId]);
  const [showHidden, setShowHidden] = useState(false);
  // What the user opened stays; what a search opened (and the user then closed)
  // is remembered only for the search it was closed under.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(NONE);
  const [closedBy, setClosedBy] = useState({
    search: "",
    ids: NONE,
  });
  const closed = closedBy.search === search ? closedBy.ids : NONE;
  const terms = data?.terms;
  const allGroups = useMemo(() => buildGroups(terms ?? []), [terms]);
  const groups = useMemo(
    () => filterGroups(allGroups, search, showHidden),
    [allGroups, search, showHidden],
  );
  const matches = searching && groups.length > 0;
  const many = searching && groups.length > OPEN_LIMIT;
  const shown =
    open || (matches && !isError && !!terms && !closed.has(SECTION));

  function setClosed(id: string, isClosed: boolean) {
    const ids = new Set(closed);
    if (isClosed) ids.add(id);
    else ids.delete(id);
    setClosedBy({ search, ids });
  }
  function toggleSection() {
    if (shown) {
      setOpen(false);
      setClosed(SECTION, true);
    } else {
      setOpen(true);
      setClosed(SECTION, false);
    }
  }
  function toggleEntity(id: string, isOpen: boolean) {
    const ids = new Set(openIds);
    if (isOpen) ids.delete(id);
    else ids.add(id);
    setOpenIds(ids);
    setClosed(id, isOpen);
  }

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

  let body = null;
  if (shown) {
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
        <>
          {many && (
            <p className="mb-2 text-sm text-muted-foreground">
              {groups.length.toLocaleString("en-US")} match. Open one to see its
              properties.
            </p>
          )}
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
              {groups.flatMap((g) => {
                const id = idOf(g.head);
                const count = g.properties.length;
                const entityOpen =
                  openIds.has(id) || (searching && !many && !closed.has(id));
                return [
                  <TermRow
                    key={id}
                    term={g.head}
                    canEdit={canEdit}
                    nested={false}
                    toggle={
                      count > 0
                        ? {
                            open: entityOpen,
                            count,
                            onToggle: () => toggleEntity(id, entityOpen),
                          }
                        : undefined
                    }
                    onSave={onSave}
                    onRemove={onRemove}
                  />,
                  ...(entityOpen ? g.properties : []).map((p) => (
                    <TermRow
                      key={idOf(p)}
                      term={p}
                      canEdit={canEdit}
                      conceptKeys={conceptKeys.get(`${p.parentKey}|${p.key}`)}
                      nested
                      onSave={onSave}
                      onRemove={onRemove}
                    />
                  )),
                ];
              })}
            </TableBody>
          </Table>
        </>
      );
    }
  }

  // The header line: what is happening to the connection, or what it holds.
  let meta: React.ReactNode = null;
  if (isLoading) {
    meta = <output>Reading…</output>;
  } else if (isError && !open) {
    meta = (
      <>
        <span role="alert">Couldn&apos;t read this connection.</span>{" "}
        <Button size="sm" variant="secondary" onClick={() => refetch()}>
          Try again
        </Button>
      </>
    );
  } else if (terms && terms.length > 0) {
    const entities = countOf(terms, "entity");
    const relationships = countOf(terms, "relationship");
    if (searching) {
      const e = groups.filter((g) => g.head.kind === "entity").length;
      const r = groups.filter((g) => g.head.kind === "relationship").length;
      meta = [
        e > 0 && `${e} of ${plural(entities, "entity", "entities")} match`,
        r > 0 &&
          `${r} of ${plural(relationships, "relationship", "relationships")}${e > 0 ? "" : " match"}`,
      ]
        .filter(Boolean)
        .join(" · ");
      if (!meta) meta = "No match";
    } else {
      meta = `${plural(entities, "entity", "entities")} · ${plural(relationships, "relationship", "relationships")}`;
    }
  }

  const headingId = `model-${connectionId}`;
  const bodyId = useId();
  return (
    <section
      id={`connection-${connectionId}`}
      ref={sectionRef}
      aria-labelledby={headingId}
      className="scroll-mt-4 border-t border-rule pt-5"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="m-0 text-section">
            <button
              type="button"
              aria-expanded={shown}
              aria-controls={bodyId}
              onClick={toggleSection}
              className="flex items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                className={`h-4 w-4 transition-transform ${shown ? "rotate-90" : ""}`}
                aria-hidden
              />
              {name}
            </button>
          </h2>
          {meta && (
            <p className="mt-1 text-meta text-muted-foreground">{meta}</p>
          )}
        </div>
        {shown && (
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
              onClick={() => refresh()}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        )}
      </div>
      <div id={bodyId} className="overflow-x-auto">
        {body}
      </div>
    </section>
  );
}
