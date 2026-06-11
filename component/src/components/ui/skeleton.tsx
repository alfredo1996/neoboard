import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Shimmer sweep (#833): a translating gradient overlay. Falls back
        // to the static block under prefers-reduced-motion (motion-safe
        // gates both the pseudo-element animation and the pulse).
        "relative overflow-hidden rounded-md bg-primary/10",
        "motion-safe:before:absolute motion-safe:before:inset-0",
        "motion-safe:before:-translate-x-full motion-safe:before:animate-shimmer",
        "motion-safe:before:bg-gradient-to-r motion-safe:before:from-transparent motion-safe:before:via-foreground/5 motion-safe:before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
