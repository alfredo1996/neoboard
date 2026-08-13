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
    onClick && "hover:bg-accent",
    className,
  );

  const focusRing =
    "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  // #1283 item 4: the remove control used to become a <span role="button">
  // whenever the tag itself was clickable, to dodge invalid nested buttons.
  // But ARIA makes the children of a `button` presentational, so browsers
  // dropped that role entirely and folded its sr-only label into the outer
  // button's accessible name — leaving a focusable element with no role.
  // The fix is to stop nesting: only the tag BODY is a button, and the
  // remove control is its sibling. One real <button> now serves both cases.
  const removeControl = onRemove && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className={cn("ml-1 rounded-full p-0.5 hover:bg-muted", focusRing)}
    >
      <X className="h-3 w-3" />
      <span className="sr-only">Remove cross-filter</span>
    </button>
  );

  const body = (
    <>
      <Filter className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">{field}</span>
      <span>=</span>
      <span className="font-medium">{value}</span>
    </>
  );

  if (onClick) {
    return (
      <div className={classes} title={tooltip}>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-1.5 cursor-pointer",
            focusRing,
          )}
        >
          {body}
        </button>
        {removeControl}
      </div>
    );
  }

  return (
    <div className={classes} title={tooltip}>
      {body}
      {removeControl}
    </div>
  );
}

export { CrossFilterTag };
