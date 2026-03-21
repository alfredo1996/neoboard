import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fieldTypeColors } from "@/lib/design-tokens";

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
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
              isSelected && "bg-accent"
            )}
            onClick={() =>
              isSelected
                ? onRemove?.(field.name)
                : onSelect?.(field.name)
            }
          >
            <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="flex-1 text-left truncate">{field.name}</span>
            {field.type && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0 font-normal",
                  fieldTypeColors[field.type]
                )}
              >
                {field.type}
              </Badge>
            )}
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
