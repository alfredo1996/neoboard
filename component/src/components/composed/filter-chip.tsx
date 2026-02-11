import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FilterChipProps {
  label: string;
  value?: string;
  onRemove?: () => void;
  className?: string;
}

function FilterChip({ label, value, onRemove, className }: FilterChipProps) {
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 pr-1 font-normal", className)}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span>{value || label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full p-0.5 hover:bg-muted"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Remove filter</span>
        </button>
      )}
    </Badge>
  );
}

export { FilterChip };
