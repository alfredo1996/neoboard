import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A property value by its JS shape: what the row renders, never a JSON string. */
export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PropertyValue[]
  | { [key: string]: PropertyValue };

export interface PropertyItem {
  key: string;
  value: PropertyValue;
}

/** Items shown before a list collapses behind "+N more". */
const LIST_PREVIEW = 5;

function ValueView({ value }: Readonly<{ value: PropertyValue }>) {
  const [expanded, setExpanded] = React.useState(false);
  if (value === undefined) return <>-</>;
  if (value === null)
    return <span className="text-muted-foreground">null</span>;
  if (value === "")
    return <span className="text-muted-foreground">(empty)</span>;
  if (typeof value !== "object") return <>{String(value)}</>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="text-muted-foreground">(empty list)</span>;
    const shown = expanded ? value : value.slice(0, LIST_PREVIEW);
    const hidden = value.length - LIST_PREVIEW;
    return (
      <>
        <ul className="space-y-0.5 [&_ul]:border-l [&_ul]:border-border [&_ul]:pl-2">
          {shown.map((v, i) => (
            // Items have no identity; the list is read-only, so the index is stable.
            <li key={i}>
              <ValueView value={v} />
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            className="mt-1 text-meta text-primary hover:underline"
            aria-label={
              expanded ? "Show fewer items" : `Show ${hidden} more items`
            }
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Show fewer" : `+${hidden} more`}
          </button>
        )}
      </>
    );
  }
  const entries = Object.entries(value);
  if (entries.length === 0)
    return <span className="text-muted-foreground">(empty map)</span>;
  return (
    <div className="space-y-0.5 border-l border-border pl-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <span className="text-muted-foreground">{k}: </span>
          <ValueView value={v} />
        </div>
      ))}
    </div>
  );
}

export interface PropertySection {
  title: string;
  items: PropertyItem[];
  collapsible?: boolean;
}

export interface PropertyPanelProps {
  sections: PropertySection[];
  editable?: boolean;
  onEdit?: (sectionTitle: string, key: string, value: string) => void;
  className?: string;
}

function PropertyPanel({
  sections,
  editable = false,
  onEdit,
  className,
}: PropertyPanelProps) {
  const collapsibleSections = sections.filter((s) => s.collapsible !== false);
  const nonCollapsibleSections = sections.filter(
    (s) => s.collapsible === false,
  );

  return (
    <div className={cn("space-y-4", className)}>
      {nonCollapsibleSections.map((section) => (
        <div key={section.title}>
          <h3 className="text-sm font-semibold mb-2">{section.title}</h3>
          <PropertyItems
            section={section}
            editable={editable}
            onEdit={onEdit}
          />
        </div>
      ))}
      {collapsibleSections.length > 0 && (
        <Accordion
          type="multiple"
          defaultValue={collapsibleSections.map((s) => s.title)}
        >
          {collapsibleSections.map((section) => (
            <AccordionItem key={section.title} value={section.title}>
              <AccordionTrigger className="text-sm font-semibold py-2">
                {section.title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({section.items.length})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <PropertyItems
                  section={section}
                  editable={editable}
                  onEdit={onEdit}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function PropertyItems({
  section,
  editable,
  onEdit,
}: {
  section: PropertySection;
  editable: boolean;
  onEdit?: (sectionTitle: string, key: string, value: string) => void;
}) {
  return (
    <div className="space-y-1">
      {section.items.map((item) => (
        <PropertyRow
          key={item.key}
          item={item}
          editable={editable}
          onSave={(value) => onEdit?.(section.title, item.key, value)}
        />
      ))}
    </div>
  );
}

function PropertyRow({
  item,
  editable,
  onSave,
}: {
  item: PropertyItem;
  editable: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const isText = typeof item.value === "string";
  const text = typeof item.value === "string" ? item.value : "";
  const [editValue, setEditValue] = React.useState(text);

  const handleSave = () => {
    onSave(editValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(text);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-3 py-1 px-1 rounded hover:bg-muted/50 group">
      <span className="w-2/5 shrink-0 text-meta text-muted-foreground [overflow-wrap:anywhere]">
        {item.key}
      </span>
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 text-sm w-32"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleSave}
            aria-label="Save"
          >
            <Check className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCancel}
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-1">
          <div
            data-testid="property-value"
            className="min-w-0 flex-1 text-body font-medium [overflow-wrap:anywhere]"
          >
            <ValueView value={item.value} />
          </div>
          {editable && isText && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${item.key}`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export { PropertyPanel };
