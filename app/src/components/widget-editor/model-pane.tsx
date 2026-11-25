"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, ExternalLink, Play } from "lucide-react";
import {
  Button,
  Input,
  SegmentedControl,
  Skeleton,
} from "@neoboard/components";
import { useOntology } from "@/hooks/use-ontology";
import { buildGroups, filterGroups } from "@/lib/ontology/group";
import type { TermGroup } from "@/lib/ontology/group";
import type { OntologyTerm } from "@/lib/ontology/merge";
import { quoteTerm } from "@/lib/connector/editor-language";

const PAGE = 50;

/** The right-hand pane's two faces (#1693). */
export type PaneView = "preview" | "model";

const VIEWS = [
  { value: "preview", label: "Preview" },
  { value: "model", label: "Model" },
];

export function PaneTabs({
  active,
  onSelect,
}: Readonly<{ active: PaneView; onSelect: (view: PaneView) => void }>) {
  return (
    <SegmentedControl
      aria-label="Side pane"
      options={VIEWS}
      value={active}
      onValueChange={(v) => onSelect(v as PaneView)}
    />
  );
}

const joinsOf = (t: OntologyTerm) =>
  (t.joins ?? []).map((j) => `${j.from} → ${j.to}`).join(", ");

/**
 * A table join names columns, and its key (`a(x)->b(id)`) is no identifier a
 * query can use. Decided by the join's shape, never by the connector.
 */
const isInsertable = (t: OntologyTerm) =>
  !t.joins?.some((j) => j.fromColumns?.length);

const idOf = (t: Pick<OntologyTerm, "kind" | "key">) => `${t.kind}:${t.key}`;

/** A name that inserts itself on click, with its display name first. */
function NameRow({
  term,
  line,
  onInsert,
  onOpen,
  openCount,
}: Readonly<{
  term: OntologyTerm;
  line: string;
  onInsert: (key: string) => void;
  onOpen?: () => void;
  openCount?: number;
}>) {
  const shown = term.displayName || term.key;
  const text = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-medium">{shown}</span>{" "}
        {term.displayName && (
          <span className="font-mono text-xs text-muted-foreground">
            {term.key}
          </span>
        )}{" "}
        {term.kind === "property" && term.type && (
          <span className="ml-auto pl-2 font-mono text-[11px] text-muted-foreground">
            {term.type}
          </span>
        )}
      </span>
      {line && (
        <span className="truncate text-xs text-muted-foreground">{line}</span>
      )}
    </>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-md hover:bg-active">
      {isInsertable(term) ? (
        <button
          type="button"
          title={`Insert ${term.key}`}
          onClick={() => onInsert(term.key)}
          className="grid min-w-0 gap-px rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text}
        </button>
      ) : (
        <div className="grid min-w-0 gap-px px-2 py-1.5">{text}</div>
      )}
      {onOpen && (
        <button
          type="button"
          aria-label={`Open ${shown}`}
          data-open-id={idOf(term)}
          onClick={onOpen}
          className="mr-1 inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {openCount}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

const Group = ({ children }: Readonly<{ children: ReactNode }>) => (
  <div className="px-2 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </div>
);

const heads = (list: TermGroup[], kind: string) =>
  list.filter((g) => g.head.kind === kind);

/** One entity (or relationship) open: its properties and the relationships that join it. */
function DetailView({
  group,
  visible,
  onInsert,
  onOpen,
}: Readonly<{
  group: TermGroup;
  visible: TermGroup[];
  onInsert: (key: string) => void;
  onOpen: (head: TermGroup["head"]) => void;
}>) {
  const { head, properties } = group;
  const joined = heads(visible, "relationship").filter((g) =>
    g.head.joins?.some((j) => j.from === head.key || j.to === head.key),
  );
  return (
    <>
      <NameRow term={head} line={head.description} onInsert={onInsert} />
      <Group>Properties</Group>
      {properties.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          No properties.
        </p>
      )}
      {properties.map((p) => (
        <NameRow
          key={p.key}
          term={p}
          line={p.description}
          onInsert={onInsert}
        />
      ))}
      {head.kind === "entity" && joined.length > 0 && (
        <>
          <Group>Relationships</Group>
          {joined.map((g) => (
            <NameRow
              key={g.head.key}
              term={g.head}
              line={joinsOf(g.head)}
              onInsert={onInsert}
              onOpen={g.properties.length ? () => onOpen(g.head) : undefined}
              openCount={g.properties.length}
            />
          ))}
        </>
      )}
    </>
  );
}

/** A labelled, paged list of entities or relationships. */
function TermSection({
  label,
  kind,
  list,
  limit,
  onMore,
  onInsert,
  onOpen,
}: Readonly<{
  label: string;
  kind: "entity" | "relationship";
  list: TermGroup[];
  limit: number;
  onMore: () => void;
  onInsert: (key: string) => void;
  onOpen: (head: TermGroup["head"]) => void;
}>) {
  return (
    <>
      {list.length > 0 && <Group>{label}</Group>}
      {list.slice(0, limit).map((g) => (
        <NameRow
          key={g.head.key}
          term={g.head}
          line={kind === "entity" ? g.head.description : joinsOf(g.head)}
          onInsert={onInsert}
          onOpen={
            kind === "entity" || g.properties.length
              ? () => onOpen(g.head)
              : undefined
          }
          openCount={g.properties.length}
        />
      ))}
      {list.length > limit && (
        <Button size="sm" variant="secondary" className="m-2" onClick={onMore}>
          Show 50 more
        </Button>
      )}
    </>
  );
}

export interface ModelPaneProps {
  connectionId: string;
  /** The editor's query language: decides how a key is quoted. */
  language: string;
  /** Called with the key as the editor should hold it (quoted when needed). */
  onInsert: (text: string) => void;
  /** Absent when there is nothing to run (a form): the pane then shows no Run. */
  onRun?: () => void;
  runDisabled: boolean;
  /** The Preview / Model switch, in the header. */
  tabs: ReactNode;
}

/**
 * The connection's model beside the query (#1693): the ontology's visible
 * terms, one entity at a time. A click inserts a key; nothing here edits a name.
 */
export function ModelPane({
  connectionId,
  language,
  onInsert,
  onRun,
  runDisabled,
  tabs,
}: Readonly<ModelPaneProps>) {
  const { data, isPending, isError, refetch } = useOntology(connectionId);
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [open, setOpen] = useState<TermGroup["head"] | null>(null);
  const [shown, setShown] = useState({ entity: PAGE, relationship: PAGE });
  const root = useRef<HTMLDivElement>(null);
  const crumb = useRef<HTMLButtonElement>(null);
  // The › that opened the detail, so closing it can give focus back.
  const opener = useRef<string | null>(null);

  // Built once per read; a search or a hidden term only narrows it.
  const groups = useMemo(
    () =>
      buildGroups((data?.terms ?? []).filter((t) => !t.orphaned)).filter(
        (g) => g.head.kind !== "property",
      ),
    [data],
  );
  const visible = useMemo(() => filterGroups(groups, "", false), [groups]);
  const matching = useMemo(
    () => filterGroups(groups, deferred, false),
    [groups, deferred],
  );
  const entities = heads(matching, "entity");
  const relationships = heads(matching, "relationship");
  const totalEntities = heads(visible, "entity").length;
  const totalRelationships = heads(visible, "relationship").length;
  const searching = deferred.trim() !== "";

  const insert = (key: string) => onInsert(quoteTerm(key, language));
  const openGroup = open
    ? visible.find((g) => g.head.kind === open.kind && g.head.key === open.key)
    : undefined;
  const openedId = openGroup ? idOf(openGroup.head) : null;

  const openTerm = (head: TermGroup["head"]) => {
    opener.current ??= idOf(head);
    setOpen(head);
  };

  // Opening moves focus to the crumb; closing returns it to the › that opened.
  useEffect(() => {
    if (openedId) {
      crumb.current?.focus();
      return;
    }
    const id = opener.current;
    opener.current = null;
    if (!id) return;
    root.current
      ?.querySelector<HTMLElement>(`[data-open-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, [openedId]);

  function body() {
    if (isPending) {
      return (
        <div data-testid="model-pane-loading" className="space-y-2 p-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      );
    }
    if (isError) {
      return (
        <div
          role="alert"
          className="grid justify-items-start gap-2 p-4 text-sm"
        >
          <span>Couldn&apos;t read this connection&apos;s model.</span>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    if (totalEntities === 0) {
      return (
        <p className="p-4 text-sm text-foreground-2">
          This connection reports no entities
        </p>
      );
    }
    if (openGroup) {
      return (
        <DetailView
          group={openGroup}
          visible={visible}
          onInsert={insert}
          onOpen={openTerm}
        />
      );
    }
    if (entities.length === 0 && relationships.length === 0) {
      return <p className="p-4 text-sm text-foreground-2">No match.</p>;
    }
    const more = (kind: "entity" | "relationship") => () =>
      setShown((s) => ({ ...s, [kind]: s[kind] + PAGE }));
    return (
      <>
        <TermSection
          label="Entities"
          kind="entity"
          list={entities}
          limit={shown.entity}
          onMore={more("entity")}
          onInsert={insert}
          onOpen={openTerm}
        />
        <TermSection
          label="Relationships"
          kind="relationship"
          list={relationships}
          limit={shown.relationship}
          onMore={more("relationship")}
          onInsert={insert}
          onOpen={openTerm}
        />
      </>
    );
  }

  const ready = !isPending && !isError && totalEntities > 0;
  let count = `${totalEntities} entities · ${totalRelationships} relationships`;
  if (searching) {
    count = `${entities.length} of ${totalEntities} entities match`;
  }

  return (
    <div
      ref={root}
      className="flex min-h-0 min-w-0 flex-col gap-2.5 border-l border-rule bg-page-ground px-5 py-3.5"
    >
      <div className="flex min-h-8 items-center justify-between">
        {tabs}
        {onRun && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRun}
            disabled={runDisabled}
            title="Run query (Ctrl+Enter / ⌘+Enter)"
          >
            <Play className="mr-1.5 h-3 w-3" aria-hidden />
            Run
          </Button>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] rounded-lg border border-card-edge bg-card shadow-card">
        <div className="grid gap-2 border-b border-rule px-3 py-2.5">
          {openGroup ? (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-sm"
            >
              <button
                ref={crumb}
                type="button"
                onClick={() => setOpen(null)}
                className="rounded text-ring hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                All terms
              </button>
              <span aria-hidden>/</span>
              <span className="truncate font-medium">
                {openGroup.head.displayName || openGroup.head.key}
              </span>
            </nav>
          ) : (
            <>
              <Input
                type="search"
                aria-label="Search the model"
                placeholder="Search entities, relationships, properties"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!ready}
                className="h-8 text-sm"
              />
              {ready && (
                <span className="text-xs text-muted-foreground">{count}</span>
              )}
            </>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto p-1">{body()}</div>
        <div className="flex flex-wrap justify-between gap-1.5 border-t border-rule px-3 py-2 text-xs text-muted-foreground">
          <span>Hidden terms are left out.</span>
          <a
            href={`/model#connection-${connectionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-ring hover:underline"
          >
            Edit names on the Model page
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
