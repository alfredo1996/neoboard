"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  buildGroups,
  filterGroups,
  type TermGroup,
} from "@/lib/ontology/group";
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
  readonly open?: boolean;
  readonly count?: number;
  readonly onToggle?: (id: string, open: boolean) => void;
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

function PropertiesToggle({
  open,
  name,
  onClick,
}: {
  readonly open: boolean;
  readonly name: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} the properties of ${name}`}
      onClick={onClick}
      className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-sm align-middle text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight
        className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        aria-hidden
      />
    </button>
  );
}

/** Display name or description: a field for someone who can edit, else text. */
function TextCell({
  term,
  field,
  name,
  editable,
  onSave,
}: {
  readonly term: OntologyTerm;
  readonly field: "displayName" | "description";
  readonly name: string;
  readonly editable: boolean;
  readonly onSave: TermRowProps["onSave"];
}) {
  const isName = field === "displayName";
  return (
    <TableCell>
      {editable ? (
        <Input
          // A new key resets the field once the saved value comes back.
          key={term[field]}
          aria-label={`${isName ? "Display name" : "Description"} of ${name}`}
          inPlace
          placeholder={isName ? "Add a name" : "Add a description"}
          maxLength={isName ? 200 : 2000}
          defaultValue={term[field]}
          onBlur={(e) =>
            e.target.value !== term[field] &&
            onSave(term, { [field]: e.target.value })
          }
        />
      ) : (
        <span>{term[field]}</span>
      )}
    </TableCell>
  );
}

function TypeCell({ term }: { readonly term: OntologyTerm }) {
  return (
    <TableCell className="text-caption text-foreground-2">
      {term.kind === "property" ? (
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
  );
}

// Memoised: a keystroke in the search box re-lists the same rows, and with
// 2,000 of them only the rows that changed should render again (#2533).
const TermRow = memo(function TermRow({
  term,
  canEdit,
  nested,
  open,
  count,
  onToggle,
  conceptKeys,
  onSave,
  onRemove,
}: TermRowProps) {
  const hasToggle = open !== undefined;
  const name = nameOf(term);
  // Orphaned terms are no longer in the connection: the server takes no edit
  // for them, only their removal.
  const editable = canEdit && !term.orphaned;
  return (
    <TableRow className={term.hidden ? "text-muted-foreground" : undefined}>
      <TableCell className={nested ? "pl-8" : "pt-3 font-semibold"}>
        {hasToggle && (
          <PropertiesToggle
            open={open}
            name={name}
            onClick={() => onToggle?.(idOf(term), open)}
          />
        )}
        {!nested && !hasToggle && <span className="mr-1 inline-block w-5" />}
        <code className={term.orphaned ? "line-through" : undefined}>
          {term.key}
        </code>
        {hasToggle && (
          <span className="ml-2 text-meta font-normal text-muted-foreground">
            {count}
          </span>
        )}
        {term.primaryKey && <Tag className="ml-2">Key</Tag>}
        {conceptKeys?.map((c) => (
          <Tag key={c} className="ml-2">
            {c} key
          </Tag>
        ))}
        {term.orphaned && (
          <Tag className="ml-2 rounded-full border-warning bg-warning/10 text-warning">
            Orphaned
          </Tag>
        )}
        {term.hidden && <Tag className="ml-2">Hidden</Tag>}
      </TableCell>
      <TextCell
        term={term}
        field="displayName"
        name={name}
        editable={editable}
        onSave={onSave}
      />
      <TextCell
        term={term}
        field="description"
        name={name}
        editable={editable}
        onSave={onSave}
      />
      <TypeCell term={term} />
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
});

/** The header line under the name: what is happening, or what the connection holds. */
function sectionMeta(args: {
  readonly terms: OntologyTerm[] | undefined;
  readonly groups: TermGroup[];
  readonly searching: boolean;
  readonly isLoading: boolean;
  readonly failedClosed: boolean;
  readonly refetch: () => void;
}): React.ReactNode {
  const { terms, groups, searching, isLoading, failedClosed, refetch } = args;
  if (isLoading) return <output>Reading…</output>;
  if (failedClosed) {
    return (
      <>
        <span role="alert">Couldn&apos;t read this connection.</span>{" "}
        <Button size="sm" variant="secondary" onClick={() => refetch()}>
          Try again
        </Button>
      </>
    );
  }
  if (!terms || terms.length === 0) return null;
  const entities = countOf(terms, "entity");
  const relationships = countOf(terms, "relationship");
  if (!searching) {
    return `${plural(entities, "entity", "entities")} · ${plural(relationships, "relationship", "relationships")}`;
  }
  // The same predicate as the totals, so "X of Y" never counts an orphan.
  const live = (kind: string) =>
    groups.filter((g) => g.head.kind === kind && !g.head.orphaned).length;
  const e = live("entity");
  const r = live("relationship");
  const orphans = groups.length - e - r;
  const parts = [
    e > 0 && `${e} of ${plural(entities, "entity", "entities")} match`,
    r > 0 &&
      `${r} of ${plural(relationships, "relationship", "relationships")}${e > 0 ? "" : " match"}`,
    orphans > 0 && `${orphans} orphaned`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No match";
}

interface TermsBodyProps {
  readonly state: "loading" | "error" | "empty" | "none" | "list";
  readonly refetch: () => void;
  readonly groups: TermGroup[];
  readonly many: boolean;
  readonly canEdit: boolean;
  readonly isEntityOpen: (id: string) => boolean;
  readonly conceptKeys: Map<string, string[]>;
  readonly onToggle: (id: string, open: boolean) => void;
  readonly onSave: TermRowProps["onSave"];
  readonly onRemove: TermRowProps["onRemove"];
}

function TermsBody(p: TermsBodyProps) {
  if (p.state === "loading") {
    return (
      <output aria-label="Loading terms" className="grid gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </output>
    );
  }
  if (p.state === "error") {
    return (
      <div role="alert" className="flex items-center gap-3 text-sm">
        <span>Could not read this connection&apos;s structure.</span>
        <Button size="sm" variant="secondary" onClick={() => p.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (p.state === "empty") {
    return (
      <p className="text-sm text-muted-foreground">
        This connection doesn&apos;t describe its structure.
      </p>
    );
  }
  if (p.state === "none") {
    return <p className="text-sm text-muted-foreground">No terms match.</p>;
  }
  return (
    <>
      {p.many && (
        <p className="mb-2 text-sm text-muted-foreground">
          {p.groups.length.toLocaleString("en-US")} match. Open one to see its
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
          {p.groups.flatMap((g) => {
            const id = idOf(g.head);
            const count = g.properties.length;
            const entityOpen = p.isEntityOpen(id);
            return [
              <TermRow
                key={id}
                term={g.head}
                canEdit={p.canEdit}
                nested={false}
                open={count > 0 ? entityOpen : undefined}
                count={count}
                onToggle={p.onToggle}
                onSave={p.onSave}
                onRemove={p.onRemove}
              />,
              ...(entityOpen ? g.properties : []).map((c) => (
                <TermRow
                  key={idOf(c)}
                  term={c}
                  canEdit={p.canEdit}
                  conceptKeys={p.conceptKeys.get(`${c.parentKey}|${c.key}`)}
                  nested
                  onSave={p.onSave}
                  onRemove={p.onRemove}
                />
              )),
            ];
          })}
        </TableBody>
      </Table>
    </>
  );
}

/** A copy of the set with `id` in it, or without it. */
function withMember(set: ReadonlySet<string>, id: string, present: boolean) {
  const next = new Set(set);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

/** Concept names by the property that keys them here, for the "<Concept> key" tag. */
function conceptKeysOf(
  concepts: ReturnType<typeof useConcepts>["data"],
  connectionId: string,
) {
  const byKey = new Map<string, string[]>();
  const sides = (concepts ?? []).flatMap((c) =>
    c.sides
      .filter((s) => s.connectionId === connectionId)
      .map((s) => ({ c, s })),
  );
  for (const { c, s } of sides) {
    const k = `${entityParentKey(s.entityKey)}|${s.keyPropertyKey}`;
    byKey.set(k, [...(byKey.get(k) ?? []), c.name]);
  }
  return byKey;
}

/** Only the changed fields are sent: a whole term would put an old value back. */
function changeOf(
  { kind, key, parentKey }: OntologyTerm,
  { displayName, description, hidden }: Partial<OntologyTerm>,
) {
  return {
    kind,
    key,
    parentKey,
    ...(displayName !== undefined && { displayName }),
    ...(description !== undefined && { description }),
    ...(hidden !== undefined && { hidden }),
  };
}

function bodyState(
  isLoading: boolean,
  isError: boolean,
  terms: OntologyTerm[] | undefined,
  groups: TermGroup[],
): TermsBodyProps["state"] {
  if (isLoading) return "loading";
  if (isError) return "error";
  if (terms?.length === 0) return "empty";
  return groups.length === 0 ? "none" : "list";
}

/** Show hidden and Refresh, for an open section. */
function SectionTools({
  name,
  showHidden,
  onShowHidden,
  isFetching,
  onRefresh,
}: {
  readonly name: string;
  readonly showHidden: boolean;
  readonly onShowHidden: (on: boolean) => void;
  readonly isFetching: boolean;
  readonly onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          aria-label={`Show hidden terms of ${name}`}
          checked={showHidden}
          onCheckedChange={onShowHidden}
        />
        Show hidden
      </label>
      <Button
        size="sm"
        variant="ghost"
        className="gap-2"
        disabled={isFetching}
        aria-label={`Refresh the structure of ${name}`}
        onClick={onRefresh}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
        />
        Refresh
      </Button>
    </div>
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
  const conceptKeys = useMemo(
    () => conceptKeysOf(concepts, connectionId),
    [concepts, connectionId],
  );
  const [showHidden, setShowHidden] = useState(false);
  // What the user opened stays; what a search opened (and the user then closed)
  // is remembered only for the search it was closed under.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(NONE);
  const [closedBy, setClosedBy] = useState({ search, ids: NONE });
  // Any change of the search, even back to an earlier string, forgets it.
  if (closedBy.search !== search) setClosedBy({ search, ids: NONE });
  const closed = closedBy.ids;
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

  function toggleSection() {
    setOpen(!shown);
    setClosedBy({ search, ids: withMember(closed, SECTION, shown) });
  }
  // These are stable across renders so a memoised row is not redrawn by a
  // keystroke in the search box.
  const toggleEntity = useCallback((id: string, isOpen: boolean) => {
    setOpenIds((prev) => withMember(prev, id, !isOpen));
    setClosedBy((prev) => ({
      search: prev.search,
      ids: withMember(prev.ids, id, isOpen),
    }));
  }, []);

  // Only the changed field is sent: props may be stale when a second save
  // follows a first, and a whole term would put the old value back.
  const { mutate } = save;
  const onSave = useCallback(
    (term: OntologyTerm, changes: Partial<OntologyTerm>) => {
      mutate([changeOf(term, changes)]);
    },
    [mutate],
  );

  const onRemove = useCallback(
    ({ kind, key, parentKey }: OntologyTerm) => {
      mutate([{ kind, key, parentKey, remove: true }]);
    },
    [mutate],
  );

  const state = bodyState(isLoading, isError, terms, groups);
  const meta = sectionMeta({
    terms,
    groups,
    searching,
    isLoading,
    failedClosed: isError && !open,
    refetch,
  });

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
          <SectionTools
            name={name}
            showHidden={showHidden}
            onShowHidden={setShowHidden}
            isFetching={isFetching}
            onRefresh={() => refresh()}
          />
        )}
      </div>
      <div id={bodyId} className="overflow-x-auto">
        {shown && (
          <TermsBody
            state={state}
            refetch={refetch}
            groups={groups}
            many={many}
            canEdit={canEdit}
            isEntityOpen={(id) =>
              openIds.has(id) || (searching && !many && !closed.has(id))
            }
            conceptKeys={conceptKeys}
            onToggle={toggleEntity}
            onSave={onSave}
            onRemove={onRemove}
          />
        )}
      </div>
    </section>
  );
}
