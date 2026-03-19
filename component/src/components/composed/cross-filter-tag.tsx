import { X, Filter } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CrossFilterTagProps {
  field: string;
  value: string;
  onRemove?: () => void;
  /** Navigate-to-source handler: called when the tag body is clicked. */
  onClick?: () => void;
  /** Hover tooltip text (rendered via the native title attribute). */
  tooltip?: string;
  className?: string;
}

function CrossFilterTag({
  field,
  value,
  onRemove,
  onClick,
  tooltip,
  className,
}: CrossFilterTagProps) {
  const classes = cn(
    badgeVariants({ variant: "outline" }),
    "gap-1.5 pr-1 font-normal",
    onClick && "cursor-pointer hover:bg-accent",
    className,
  );

  const content = (
    <>
      <Filter className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">{field}</span>
      <span>=</span>
      <span className="font-medium">{value}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 rounded-full p-0.5 hover:bg-muted"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Remove cross-filter</span>
        </button>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} title={tooltip}>
        {content}
      </button>
    );
  }

  return (
    <div className={classes} title={tooltip}>
      {content}
    </div>
  );
}

export { CrossFilterTag };
