import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterLineFilter {
  id: string;
  /** The parameter's label, e.g. "Decade". */
  label: string;
  value: string;
  /** Hover text on the chip, e.g. where the value came from. */
  title?: string;
  /** Makes the sentence a button, e.g. to jump to what set the filter. */
  onSelect?: () => void;
}

export interface FilterLineProps {
  filters: readonly FilterLineFilter[];
  onRemove: (id: string) => void;
  onReset: () => void;
  /** Lead-in word before the chips. */
  prefix?: string;
  className?: string;
}

/** Active filters as sentences ("Decade is 1990s ×") in pill chips, plus Reset. */
function FilterLine({
  filters,
  onRemove,
  onReset,
  prefix = "Showing",
  className,
}: Readonly<FilterLineProps>) {
  if (filters.length === 0) return null;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">Active filters</legend>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 text-caption text-foreground-2",
          className,
        )}
      >
        <span>{prefix}</span>
        {filters.map((f) => (
          <span
            key={f.id}
            title={f.title}
            className="inline-flex items-center gap-1.5 rounded-full border border-card-edge bg-card py-[3px] pl-3 pr-1.5 text-foreground"
          >
            {f.onSelect ? (
              <button
                type="button"
                onClick={f.onSelect}
                className="rounded-full hover:underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {f.label} is <b className="font-medium">{f.value}</b>
              </button>
            ) : (
              <span>
                {f.label} is <b className="font-medium">{f.value}</b>
              </span>
            )}
            <button
              type="button"
              aria-label={`Remove ${f.label} filter`}
              onClick={() => onRemove(f.id)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-active hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onReset}
          className="rounded px-1 py-0.5 text-foreground-2 underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Reset
        </button>
      </div>
    </fieldset>
  );
}

export { FilterLine };
