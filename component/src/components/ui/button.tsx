import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Motion wired to the design-system tokens (--duration-fast / --ease-standard)
  // and scoped to paint-only properties, never `transition-all`. Focus ring is
  // a confident 2px citrine with an offset so keyboard focus is unmissable.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        // Tonal (#824): the M3 'filled tonal' warm action. Strengthened from a
        // near-invisible 12% wash to a confident citrine chip with an inset
        // ring, so it reads as a real secondary action — all from the --ring
        // (citrine) token at alpha, so it adapts to dark mode automatically.
        tonal:
          "bg-[hsl(var(--ring)/0.14)] text-accent-foreground ring-1 ring-inset ring-[hsl(var(--ring)/0.30)] hover:bg-[hsl(var(--ring)/0.22)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        // Canonical semantic actions (Epic B #1126) — solid like destructive,
        // sourced from --success/--warning tokens so they track theme.
        success:
          "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] shadow-sm hover:bg-[hsl(var(--success)/0.9)] hover:shadow-md",
        warning:
          "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] shadow-sm hover:bg-[hsl(var(--warning)/0.9)] hover:shadow-md",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-[hsl(var(--ring)/0.5)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        // ghost + link are Button-only interaction variants — the documented
        // exceptions to the canonical union shared with Badge/Alert (#1126).
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * The action trigger; variants: default, tonal, destructive, success, warning,
 * outline, secondary, ghost, link; sizes: default, sm, lg, icon; asChild slots.
 * When to use: any one-shot action — Run Query, Save Dashboard, Add Widget;
 * `tonal` for warm secondary actions, `destructive` for deletes.
 * When not to: persistent on/off state — use Toggle or Switch; pure
 * navigation styled as text — use BreadcrumbLink or variant="link" sparingly.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
