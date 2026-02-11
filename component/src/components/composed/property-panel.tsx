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

export interface PropertyItem {
  key: string;
  value: string;
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
  const nonCollapsibleSections = sections.filter((s) => s.collapsible === false);

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
  const [editValue, setEditValue] = React.useState(item.value);

  const handleSave = () => {
    onSave(editValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(item.value);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-1 px-1 rounded hover:bg-muted/50 group">
      <span className="text-sm text-muted-foreground truncate min-w-0">{item.key}</span>
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
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave} aria-label="Save">
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel} aria-label="Cancel">
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium truncate">{item.value}</span>
          {editable && (
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
