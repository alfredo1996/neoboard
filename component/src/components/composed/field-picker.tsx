import { GripVertical } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";

export interface FieldOption {
  name: string;
  type?: "string" | "number" | "date" | "boolean" | "object";
}

export interface FieldPickerProps {
  fields: FieldOption[];
  selected?: string[];
  onSelect?: (field: string) => void;
  onRemove?: (field: string) => void;
  className?: string;
}

function FieldPicker({
  fields,
  selected = [],
  onSelect,
  onRemove,
  className,
}: FieldPickerProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {fields.map((field) => {
        const isSelected = selected.includes(field.name);
        return (
          <button
            key={field.name}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isSelected && "bg-accent",
            )}
            onClick={() =>
              isSelected ? onRemove?.(field.name) : onSelect?.(field.name)
            }
          >
            <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left truncate">{field.name}</span>
            {field.type && <Tag>{field.type}</Tag>}
          </button>
        );
      })}
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No fields available
        </p>
      )}
    </div>
  );
}

export { FieldPicker };
