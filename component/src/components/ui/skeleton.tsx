import { cn } from "@/lib/utils";

/**
 * Shape-mimicking loading placeholder: a flat block that pulses slowly (2s) and stays static under prefers-reduced-motion.
 * When to use: reserving layout while widget data loads — chart areas, table rows, dashboard cards — to avoid layout shift. Pair it with a `role="status"` line that names what loads.
 * When not to: for indeterminate inline waits use Spinner; for blocking an already-rendered widget during refresh use LoadingOverlay.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-sm bg-skeleton motion-safe:animate-skeleton-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
