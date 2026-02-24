import * as React from "react";
import { ChevronRight, ChevronDown, Database, Circle, ArrowRight, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types — re-exported so query-editor can import them
// ---------------------------------------------------------------------------

export interface PropertyDef {
  name: string;
  type: string;
}

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export interface DatabaseSchema {
  type: "neo4j" | "postgresql";
  labels?: string[];
  relationshipTypes?: string[];
  nodeProperties?: Record<string, PropertyDef[]>;
  relProperties?: Record<string, PropertyDef[]>;
  tables?: TableDef[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaBrowserProps {
  schema: DatabaseSchema;
  onInsert: (text: string) => void;
  /** Collapse/expand the sidebar */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Small internal components
// ---------------------------------------------------------------------------

interface TreeSectionProps {
  label: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function TreeSection({ label, icon, defaultOpen = true, children }: TreeSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors rounded"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {icon}
        <span className="truncate">{label}</span>
      </button>
      {open && <div className="pl-4">{children}</div>}
    </div>
  );
}

interface TreeItemProps {
  label: string;
  detail?: string;
  onInsert: (text: string) => void;
  insertText: string;
}

function TreeItem({ label, detail, onInsert, insertText }: TreeItemProps) {
  return (
    <button
      type="button"
      onClick={() => onInsert(insertText)}
      title={`Insert: ${insertText}`}
      className="flex w-full items-center justify-between gap-1 px-2 py-0.5 text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors text-left group"
    >
      <span className="truncate font-mono">{label}</span>
      {detail && (
        <span className="text-muted-foreground/60 group-hover:text-muted-foreground shrink-0 text-[10px]">
          {detail}
        </span>
      )}
    </button>
  );
}

interface TableTreeProps {
  table: TableDef;
  onInsert: (text: string) => void;
}

function TableTree({ table, onInsert }: TableTreeProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div>
      {/* Row: insert button + toggle button side-by-side to avoid nested interactives */}
      <div className="flex items-center gap-1 px-2 py-0.5">
        <button
          type="button"
          onClick={() => onInsert(table.name)}
          title={`Insert: ${table.name}`}
          aria-label={`Insert ${table.name}`}
          className="truncate font-mono text-xs rounded hover:bg-accent hover:text-accent-foreground transition-colors text-left flex-1 py-0.5"
        >
          <Columns3 className="h-3 w-3 shrink-0 text-muted-foreground inline-block mr-1 align-middle" />
          <span className="align-middle">{table.name}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Toggle ${table.name} columns`}
          data-testid={`table-toggle-${table.name}`}
          className="shrink-0 rounded hover:bg-accent hover:text-accent-foreground transition-colors p-0.5"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
      {open && table.columns.length > 0 && (
        <div className="pl-6">
          {table.columns.map((col) => (
            <TreeItem
              key={col.name}
              label={col.name}
              detail={col.type}
              onInsert={onInsert}
              insertText={col.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SchemaBrowser
// ---------------------------------------------------------------------------

function SchemaBrowser({
  schema,
  onInsert,
  collapsed = false,
  onCollapsedChange,
  className,
}: SchemaBrowserProps) {
  const toggleCollapse = () => onCollapsedChange?.(!collapsed);

  if (collapsed) {
    return (
      <div className={cn("flex flex-col items-center border-r bg-muted/20 w-8 shrink-0", className)}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mt-1"
          onClick={toggleCollapse}
          aria-label="Expand schema browser"
          title="Expand schema browser"
        >
          <Database className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col border-r bg-muted/20 w-48 shrink-0 overflow-hidden",
        className
      )}
      data-testid="schema-browser"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b shrink-0">
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Schema</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={toggleCollapse}
          aria-label="Collapse schema browser"
          title="Collapse schema browser"
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {schema.type === "neo4j" && (
          <>
            {schema.labels && schema.labels.length > 0 && (
              <TreeSection
                label="Node Labels"
                icon={<Circle className="h-3 w-3" />}
              >
                {schema.labels.map((label) => (
                  <TreeItem
                    key={label}
                    label={label}
                    onInsert={onInsert}
                    insertText={label}
                  />
                ))}
              </TreeSection>
            )}

            {schema.relationshipTypes && schema.relationshipTypes.length > 0 && (
              <TreeSection
                label="Relationships"
                icon={<ArrowRight className="h-3 w-3" />}
              >
                {schema.relationshipTypes.map((rel) => (
                  <TreeItem
                    key={rel}
                    label={rel}
                    onInsert={onInsert}
                    insertText={rel}
                  />
                ))}
              </TreeSection>
            )}

            {schema.nodeProperties && Object.keys(schema.nodeProperties).length > 0 && (
              <TreeSection
                label="Node Properties"
                icon={<Columns3 className="h-3 w-3" />}
                defaultOpen={false}
              >
                {Object.entries(schema.nodeProperties).map(([label, props]) => (
                  <div key={label}>
                    <div className="px-2 py-0.5 text-xs text-muted-foreground font-medium">
                      {label}
                    </div>
                    {props.map((p) => (
                      <TreeItem
                        key={`${label}.${p.name}`}
                        label={p.name}
                        detail={p.type}
                        onInsert={onInsert}
                        insertText={p.name}
                      />
                    ))}
                  </div>
                ))}
              </TreeSection>
            )}
          </>
        )}

        {schema.type === "postgresql" && (
          <>
            {schema.tables && schema.tables.length > 0 && (
              <TreeSection
                label="Tables"
                icon={<Database className="h-3 w-3" />}
              >
                {schema.tables.map((table) => (
                  <TableTree key={table.name} table={table} onInsert={onInsert} />
                ))}
              </TreeSection>
            )}
          </>
        )}

        {/* Empty state — shown only when the schema type has no data at all */}
        {((schema.type === "neo4j" &&
          !schema.labels?.length &&
          !schema.relationshipTypes?.length &&
          !Object.keys(schema.nodeProperties ?? {}).length &&
          !Object.keys(schema.relProperties ?? {}).length) ||
          (schema.type === "postgresql" && !schema.tables?.length)) && (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No schema data available
          </p>
        )}
      </div>
    </div>
  );
}

export { SchemaBrowser };
