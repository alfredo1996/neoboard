import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Pills read cleaner flat — no shadow on a 20px chip. Focus-visible (not
  // focus) so clicking a clickable badge with a mouse doesn't flash a ring.
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        // Tonal (citrine): warm status/featured chip, matching the button
        // tonal variant — from the --ring token at alpha so it tracks theme.
        tonal:
          "border-transparent bg-[hsl(var(--ring)/0.14)] text-accent-foreground hover:bg-[hsl(var(--ring)/0.22)]",
        // Semantic status chips — tonal tints (matching the citrine `tonal`
        // pattern) so a positive/warning status reads as colored without the
        // heaviness of a solid fill.
        success:
          "border-transparent bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.22)]",
        warning:
          "border-transparent bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning)/0.22)]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Small non-interactive status pill; variants: default, tonal, success,
 * warning, secondary, destructive, outline.
 * When to use: labeling state or category — connection health (success/
 * warning), connector labels, "Enterprise" feature tags, row counts.
 * When not to: anything clickable — use Button (size="sm") or Toggle for
 * pressed state; long messages — use Alert.
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
