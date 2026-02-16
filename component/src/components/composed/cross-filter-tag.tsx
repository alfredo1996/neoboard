import { X, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CrossFilterTagProps {
  source: string;
  field: string;
  value: string;
  onRemove?: () => void;
  className?: string;
}

function CrossFilterTag({
  source,
  field,
  value,
  onRemove,
  className,
}: CrossFilterTagProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 pr-1 font-normal", className)}
    >
      <Filter className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{source}</span>
      <span className="font-medium">{field}</span>
      <span>=</span>
      <span className="font-medium">{value}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full p-0.5 hover:bg-muted"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Remove cross-filter</span>
        </button>
      )}
    </Badge>
  );
}

export { CrossFilterTag };
